import TextField from "@components/ui/TextField";

export function TextFieldShowcase() {
	return (
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<TextField label="账号或邮箱" value="alikia2x@outlook.com" />
			<TextField label="密码" type="password" helperText="请输入至少 8 个字符" />
			<TextField label="邮箱地址" type="email" required />
			<TextField placeholder="请输入用户名" />
			<TextField
				defaultValue="星间旅行"
				leadingIcon="search"
				trailingIcon="clear"
				aria-label="搜索歌曲、艺人或专辑"
			/>
			<TextField size="sm" placeholder="搜索" aria-label="搜索" />
			<TextField
				size="lg"
				placeholder="搜索歌曲、艺人或专辑"
				aria-label="搜索歌曲、艺人或专辑"
			/>
			<TextField label="暂不可用" value="当前不可编辑" disabled />
			<TextField label="邮箱地址" value="example" errorText="请输入有效的邮箱地址" />
		</div>
	);
}
