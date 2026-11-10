import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import Select from "@components/ui/Select";
import Modal from "@components/ui/Modal";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { InvitationCodeDto } from "@cvsa/contracts";
import Plus from "lucide-solid/icons/plus";
import Copy from "lucide-solid/icons/copy";
import Check from "lucide-solid/icons/check";
import Trash2 from "lucide-solid/icons/trash-2";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Link from "lucide-solid/icons/link";
import Bot from "lucide-solid/icons/bot";

export default function InvitationManagement() {
	const t = getComponentT("invitations");

	const [invitations, setInvitations] = createSignal<InvitationCodeDto[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [isCreateOpen, setIsCreateOpen] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);
	const [copiedCode, setCopiedCode] = createSignal<string | null>(null);

	// Create form signals
	const [customCode, setCustomCode] = createSignal("");
	const [selectedRole, setSelectedRole] = createSignal<"editor" | "admin">("editor");
	const [maxUsesInput, setMaxUsesInput] = createSignal("1");
	const [expiresDaysInput, setExpiresDaysInput] = createSignal("");

	// Revoke confirmation modal signal
	const [revokingTarget, setRevokingTarget] = createSignal<InvitationCodeDto | null>(null);
	const [revoking, setRevoking] = createSignal(false);

	const loadInvitations = async () => {
		setLoading(true);
		try {
			const res = await api.invitation.list();
			if (res.ok && res.data) {
				setInvitations(res.data.data);
			} else {
				toast.error(res.ok ? t("empty") : res.error.message || t("empty"));
			}
		} finally {
			setLoading(false);
		}
	};

	onMount(() => {
		void loadInvitations();
	});

	const handleCreate = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting()) return;
		setSubmitting(true);

		const maxUses = Number.parseInt(maxUsesInput(), 10);
		const expiresInDays = expiresDaysInput().trim()
			? Number.parseInt(expiresDaysInput(), 10)
			: null;

		try {
			const res = await api.invitation.create({
				code: customCode().trim() || undefined,
				roleName: selectedRole(),
				maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1,
				expiresInDays:
					expiresInDays !== null && Number.isFinite(expiresInDays) && expiresInDays > 0
						? expiresInDays
						: null,
			});

			if (res.ok && res.data) {
				toast.success(t("created"));
				setIsCreateOpen(false);
				setCustomCode("");
				setSelectedRole("editor");
				setMaxUsesInput("1");
				setExpiresDaysInput("");
				void loadInvitations();
			} else {
				toast.error(res.ok ? t("empty") : res.error.message || t("empty"));
			}
		} finally {
			setSubmitting(false);
		}
	};

	const handleRevoke = async () => {
		const target = revokingTarget();
		if (!target || revoking()) return;
		setRevoking(true);
		try {
			const res = await api.invitation.revoke(target.id);
			if (res.ok) {
				toast.success(t("revoked"));
				setRevokingTarget(null);
				void loadInvitations();
			} else {
				toast.error(res.ok ? t("revokeConfirm") : res.error.message || t("revokeConfirm"));
			}
		} finally {
			setRevoking(false);
		}
	};

	const copyToClipboard = async (text: string, code: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedCode(code);
			toast.success(t("copied"));
			setTimeout(() => {
				if (copiedCode() === code) setCopiedCode(null);
			}, 2000);
		} catch {
			toast.error("Failed to copy");
		}
	};

	const copyRegistrationLink = (code: string) => {
		const origin = typeof window !== "undefined" ? window.location.origin : "";
		const url = `${origin}/register?invitationCode=${encodeURIComponent(code)}`;
		void copyToClipboard(url, `link-${code}`);
	};

	const getStatus = (item: InvitationCodeDto): "expired" | "exhausted" | "active" => {
		if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) {
			return "expired";
		}
		if (item.usedCount >= item.maxUses) {
			return "exhausted";
		}
		return "active";
	};

	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return t("never");
		const d = new Date(dateStr);
		return d.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div class="flex flex-col gap-6 w-full">
			{/* Page Header */}
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
				<div>
					<h1 class="ts-heading-1 text-display">{t("title")}</h1>
					<p class="ts-body-2 text-secondary mt-1">{t("description")}</p>
				</div>
				<div class="flex items-center gap-2">
					<a href="/admin/crawler">
						<Button
							variant="outlined"
							size="sm"
							class="gap-1.5"
							aria-label={t("crawler")}
						>
							<Bot class="w-3.5 h-3.5" />
							<span>{t("crawler")}</span>
						</Button>
					</a>
					<Button
						variant="outlined"
						size="sm"
						onClick={loadInvitations}
						disabled={loading()}
						aria-label={t("refresh")}
					>
						<RefreshCw class={`w-3.5 h-3.5 mr-1 ${loading() ? "animate-spin" : ""}`} />
						{t("refresh")}
					</Button>
					<Button
						variant="filled"
						size="sm"
						onClick={() => setIsCreateOpen(true)}
						aria-label={t("create")}
					>
						<Plus class="w-3.5 h-3.5 mr-1" />
						{t("create")}
					</Button>
				</div>
			</div>

			{/* Invitations Table Card */}
			<div class="rounded-xl border border-border bg-surface shadow-md overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full text-left border-collapse">
						<thead>
							<tr class="border-b border-border bg-surface-container-low text-secondary ts-caption">
								<th class="px-4 py-3 font-medium">{t("code")}</th>
								<th class="px-4 py-3 font-medium">{t("role")}</th>
								<th class="px-4 py-3 font-medium">{t("status")}</th>
								<th class="px-4 py-3 font-medium">{t("usedCount")}</th>
								<th class="px-4 py-3 font-medium">{t("expiresAt")}</th>
								<th class="px-4 py-3 font-medium">{t("creator")}</th>
								<th class="px-4 py-3 font-medium text-right">{t("actions")}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border ts-body-2">
							<Show when={!loading() && invitations().length === 0}>
								<tr>
									<td colspan={7} class="px-4 py-12 text-center text-tertiary">
										{t("empty")}
									</td>
								</tr>
							</Show>

							<For each={invitations()}>
								{(item) => {
									const status = () => getStatus(item);
									return (
										<tr class="hover:bg-surface-container-low/50 transition-colors">
											{/* Code and quick copy */}
											<td class="px-4 py-3">
												<div class="flex items-center gap-2">
													<span class="font-code font-medium text-display">
														{item.code}
													</span>
													<button
														type="button"
														class="p-1 rounded hover:bg-surface-container-medium text-secondary hover:text-display transition-colors"
														onClick={() =>
															copyToClipboard(item.code, item.code)
														}
														title={t("copyCode")}
													>
														<Show
															when={copiedCode() === item.code}
															fallback={<Copy class="w-3.5 h-3.5" />}
														>
															<Check class="w-3.5 h-3.5 text-primary" />
														</Show>
													</button>
													<button
														type="button"
														class="p-1 rounded hover:bg-surface-container-medium text-secondary hover:text-display transition-colors"
														onClick={() =>
															copyRegistrationLink(item.code)
														}
														title={t("copyLink")}
													>
														<Show
															when={
																copiedCode() === `link-${item.code}`
															}
															fallback={<Link class="w-3.5 h-3.5" />}
														>
															<Check class="w-3.5 h-3.5 text-primary" />
														</Show>
													</button>
												</div>
											</td>

											{/* Role */}
											<td class="px-4 py-3">
												<Badge
													size="sm"
													variant={
														item.roleName === "admin"
															? "warning"
															: "neutral"
													}
												>
													{item.roleName}
												</Badge>
											</td>

											{/* Status */}
											<td class="px-4 py-3">
												<Show when={status() === "active"}>
													<Badge size="sm" variant="success">
														{t("statusActive")}
													</Badge>
												</Show>
												<Show when={status() === "exhausted"}>
													<Badge size="sm" variant="warning">
														{t("statusExhausted")}
													</Badge>
												</Show>
												<Show when={status() === "expired"}>
													<Badge size="sm" variant="danger">
														{t("statusExpired")}
													</Badge>
												</Show>
											</td>

											{/* Used / Max */}
											<td class="px-4 py-3">
												<span class="text-display">{item.usedCount}</span>
												<span class="text-tertiary"> / {item.maxUses}</span>
											</td>

											{/* Expiry */}
											<td class="px-4 py-3 text-secondary ts-caption">
												{formatDate(item.expiresAt)}
											</td>

											{/* Creator */}
											<td class="px-4 py-3 text-secondary ts-caption">
												{item.creatorUsername || item.createdBy || "-"}
											</td>

											{/* Actions */}
											<td class="px-4 py-3 text-right">
												<Button
													size="sm"
													variant="ghost"
													class="text-error hover:bg-surface-container-medium"
													onClick={() => setRevokingTarget(item)}
													title={t("revoke")}
												>
													<Trash2 class="w-3.5 h-3.5 mr-1" />
													{t("revoke")}
												</Button>
											</td>
										</tr>
									);
								}}
							</For>
						</tbody>
					</table>
				</div>
			</div>

			{/* Create Invitation Modal */}
			<Modal
				isOpen={isCreateOpen()}
				onClose={() => setIsCreateOpen(false)}
				title={t("create")}
				description={t("description")}
				size="sm"
			>
				<form onSubmit={handleCreate} class="flex flex-col gap-4 p-4">
					<TextField
						label={t("code")}
						size="sm"
						placeholder={t("codePlaceholder")}
						value={customCode()}
						onInput={(e) => setCustomCode(e.currentTarget.value)}
					/>

					<Select
						label={t("role")}
						size="sm"
						options={[
							{ value: "editor", label: t("roleEditor") },
							{ value: "admin", label: t("roleAdmin") },
						]}
						value={selectedRole()}
						onValueChange={(val) => {
							if (val === "editor" || val === "admin") {
								setSelectedRole(val);
							}
						}}
					/>

					<div class="grid grid-cols-2 gap-3">
						<TextField
							label={t("maxUses")}
							size="sm"
							type="number"
							placeholder={t("maxUsesPlaceholder")}
							value={maxUsesInput()}
							onInput={(e) => setMaxUsesInput(e.currentTarget.value)}
						/>

						<TextField
							label={t("expiresInDays")}
							size="sm"
							type="number"
							placeholder={t("expiresInDaysPlaceholder")}
							value={expiresDaysInput()}
							onInput={(e) => setExpiresDaysInput(e.currentTarget.value)}
						/>
					</div>

					<div class="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
						<Button
							type="button"
							variant="outlined"
							size="sm"
							onClick={() => setIsCreateOpen(false)}
							disabled={submitting()}
						>
							{t("cancel")}
						</Button>
						<Button type="submit" variant="filled" size="sm" disabled={submitting()}>
							{submitting() ? t("loading") : t("confirm")}
						</Button>
					</div>
				</form>
			</Modal>

			{/* Revoke Confirmation Modal */}
			<Modal
				isOpen={revokingTarget() !== null}
				onClose={() => setRevokingTarget(null)}
				title={t("revoke")}
				description={t("revokeConfirm")}
				size="sm"
			>
				<div class="flex flex-col gap-4 p-4">
					<p class="ts-body-2 text-secondary">
						{t("code")}:{" "}
						<span class="font-code font-medium text-display">
							{revokingTarget()?.code}
						</span>
					</p>
					<div class="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-border">
						<Button
							type="button"
							variant="outlined"
							size="sm"
							onClick={() => setRevokingTarget(null)}
							disabled={revoking()}
						>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							variant="filled"
							size="sm"
							class="bg-error text-on-error hover:bg-error/90"
							onClick={handleRevoke}
							disabled={revoking()}
						>
							{revoking() ? t("loading") : t("confirm")}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
