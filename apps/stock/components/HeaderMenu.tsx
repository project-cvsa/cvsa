"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Menu, Palette } from "lucide-react";
import { useColorMode } from "@/components/ColorModeContext";

interface HeaderMenuProps {
	isAuthenticated: boolean;
	onLoginClick: () => void;
	onLogout: () => void;
}

export function HeaderMenu({ isAuthenticated, onLoginClick, onLogout }: HeaderMenuProps) {
	const { mode, toggle } = useColorMode();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon-lg">
					<Menu className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={toggle}>
					<Palette className="size-4" />
					切换颜色（{mode === "red-up" ? "红涨绿跌" : "绿涨红跌"}）
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{isAuthenticated ? (
					<DropdownMenuItem onClick={onLogout}>
						<LogOut className="size-4" />
						退出登录
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onLoginClick}>
						<LogIn className="size-4" />
						登录
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
