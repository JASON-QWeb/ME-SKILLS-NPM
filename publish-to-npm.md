# Publish SkillsHub To npm

This guide assumes the package is in [`package.json`](../package.json) and the repository is pushed to GitHub.

## 1. Confirm the package name

Check the current npm package name:

```bash
node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).name"
```

If `skillshub` is already taken on npm and you want your own package name, update these fields first:

- `package.json.name`
- `package.json.repository.url`
- `package.json.homepage`
- `package.json.bugs.url`

If you want a scoped package, use a name like `@your-scope/skillshub`.

## 2. Log in to npm

```bash
npm login
npm whoami
```

`npm whoami` should print your npm username.

## 3. Verify before publishing

Run the full checks locally:

```bash
pnpm type-check
pnpm test
pnpm build
npm pack --dry-run
```

What to confirm:

- tests pass
- build succeeds
- `npm pack --dry-run` shows the correct package name
- the tarball contains `dist/`, `bin/`, `README.md`, and `ThirdPartyNoticeText.txt`

## 4. Bump the version

Choose one:

```bash
npm version patch
npm version minor
npm version major
```

If you do not want Git to create a tag automatically yet:

```bash
npm version patch --no-git-tag-version
```

## 5. Publish

For a public unscoped package:

```bash
npm publish
```

For a public scoped package:

```bash
npm publish --access public
```

For a test release:

```bash
npm publish --tag next
```

The existing snapshot helper is also available:

```bash
pnpm publish:snapshot
```

## 6. Verify the published package

After publish:

```bash
npm view skillshub version
npx skillshub --version
```

If you changed the package name, replace `skillshub` in the commands above.

## Recommended Release Sequence

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

## Notes

- `prepublishOnly` already runs `npm run build`, so publish will rebuild before upload.
- If you publish under a new name, update the README examples if you want users to run `npx <your-package-name> ...`.
- If this repo is private but the npm package should be public, that is fine as long as your npm access is configured correctly.
