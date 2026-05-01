"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onLogin: (token: string) => void;
}

export function LoginDialog({ open, onOpenChange, onLogin }: LoginDialogProps) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleLogin = async () => {
		if (!password) return;
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("/api/auth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password }),
			});
			const data = (await res.json()) as {
				token?: string;
				error?: string;
			};
			if (res.ok && data.token) {
				onLogin(data.token);
				setPassword("");
				onOpenChange(false);
			} else {
				setError(data.error ?? "Login failed");
			}
		} catch {
			setError("Network error");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					setPassword("");
					setError(null);
				}
				onOpenChange(o);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>管理员登录</DialogTitle>
					<DialogDescription>请输入主密码以登录管理后台</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 mt-2">
					<Input
						type="password"
						placeholder="主密码"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleLogin();
						}}
						autoFocus
					/>
					{error && <div className="text-sm text-destructive">{error}</div>}
					<Button onClick={handleLogin} disabled={!password || loading}>
						{loading ? "验证中..." : "登录"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
