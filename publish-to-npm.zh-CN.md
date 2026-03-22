# 将 SkillsHub 发布到 npm

本指南假设该包已在 [`package.json`](../package.json) 中定义，并且代码仓库已推送到 GitHub。

## 1. 确认包名

检查当前的 npm 包名：

```bash
node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).name"
```

如果 `skillshub` 在 npm 上已被占用，或者你想使用自己的包名，请先更新以下字段：

- `package.json.name`
- `package.json.repository.url`
- `package.json.homepage`
- `package.json.bugs.url`

如果你想发布作用域包（scoped package），请使用类似 `@your-scope/skillshub` 的名称。

## 2. 登录 npm

```bash
npm login
npm whoami
```

`npm whoami` 应当打印出你的 npm 用户名。

## 3. 发布前验证

在本地运行完整检查：

```bash
pnpm type-check
pnpm test
pnpm build
npm pack --dry-run
```

需要确认的事项：

- 测试通过
- 构建成功
- `npm pack --dry-run` 显示正确的包名
- 压缩包（tarball）包含 `dist/`、`bin/`、`README.md` 和 `ThirdPartyNoticeText.txt`

## 4. 升级版本号

选择其中之一：

```bash
npm version patch
npm version minor
npm version major
```

如果你还不希望 Git 自动创建标签（tag）：

```bash
npm version patch --no-git-tag-version
```

## 5. 发布

对于公共的非作用域包：

```bash
npm publish
```

对于公共的作用域包：

```bash
npm publish --access public
```

对于测试版本发布：

```bash
npm publish --tag next
```

现有的快照辅助命令也可用：

```bash
pnpm publish:snapshot
```

## 6. 验证已发布的包

发布后运行：

```bash
npm view skillshub version
npx skillshub --version
```

如果你更改了包名，请在上述命令中替换 `skillshub`。

## 推荐的发布流程

```bash
git checkout main
git pull
pnpm install
pnpm type-check
pnpm test
pnpm build
npm pack --dry-run
npm version patch
git push --follow-tags
npm publish
```

## 注意事项

- `prepublishOnly` 脚本会自动运行 `npm run build`，因此发布前会先重新构建再上传。
- 如果你以新名称发布，请更新 README 中的示例，以便用户能够运行 `npx <your-package-name> ...`。
- 如果此仓库是私有的，但 npm 包需要公开，只要你的 npm 访问权限配置正确即可。
