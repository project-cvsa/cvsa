import torch
import torch.nn as nn
import torch.nn.functional as F


class VideoClassifierV3_15(nn.Module):
    """
    3-channel (title, description, tags) x 1024-d embedding classifier.
    Matches the architecture of akari/3.17.onnx.
    """

    def __init__(
        self,
        embedding_dim: int = 1024,
        hidden_dim: int = 648,
        output_dim: int = 3,
        temperature: float = 1.7,
    ):
        super().__init__()
        self.num_channels = 3
        self.channel_names = ["title", "description", "tags"]

        self.temperature = nn.Parameter(torch.tensor(temperature))
        self.channel_weights = nn.Parameter(torch.ones(self.num_channels))

        self.fc = nn.Sequential(
            nn.Linear(embedding_dim * self.num_channels, hidden_dim * 2),
            nn.BatchNorm1d(hidden_dim * 2),
            nn.Dropout(0.2),
            nn.GELU(),
            nn.Linear(hidden_dim * 2, output_dim),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        for layer in self.fc:
            if isinstance(layer, nn.Linear):
                nn.init.kaiming_normal_(layer.weight, nonlinearity="relu")
                nn.init.zeros_(layer.bias)

    def forward(self, channel_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            channel_features: Tensor of shape [batch_size, 3, 1024]
        Returns:
            logits: Tensor of shape [batch_size, 3]
        """
        weights = torch.sigmoid(self.channel_weights)
        weighted_features = channel_features * weights.unsqueeze(0).unsqueeze(-1)
        combined = weighted_features.view(weighted_features.size(0), -1)
        return self.fc(combined)

    def get_channel_weights(self):
        return (
            torch.softmax(self.channel_weights / self.temperature, dim=0)
            .detach()
            .cpu()
            .numpy()
        )


class AdaptiveRecallLoss(nn.Module):
    def __init__(
        self,
        class_weights: torch.Tensor,
        alpha: float = 0.9,
        gamma: float = 1.6,
        fp_penalty: float = 0.8,
    ):
        super().__init__()
        self.class_weights = class_weights
        self.alpha = alpha
        self.gamma = gamma
        self.fp_penalty = fp_penalty

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce_loss = F.cross_entropy(
            logits, targets, weight=self.class_weights, reduction="none"
        )
        pt = torch.exp(-ce_loss)
        focal_loss = ((1 - pt) ** self.gamma) * ce_loss

        class_mask = F.one_hot(targets, num_classes=len(self.class_weights))
        weights = (self.alpha + (1 - self.alpha) * pt.unsqueeze(-1)) * class_mask
        recall_loss = (weights * focal_loss.unsqueeze(-1)).sum(dim=1)

        probs = F.softmax(logits, dim=1)
        fp_mask = (targets != 0) & (torch.argmax(logits, dim=1) == 0)
        fp_loss = self.fp_penalty * probs[:, 0][fp_mask].pow(2).sum()

        return recall_loss.mean() + fp_loss / max(1, len(targets))
