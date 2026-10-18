# 商店信息 — 简体中文

## 名称 (manifest appName, 1.0.1)
Popout Authenticator — 2FA 身份验证器

## 摘要 (manifest appDesc, 132 字符以内)
开源 2FA 验证器。在弹出窗口、独立窗口或侧边栏中显示一次性验证码，可用密码锁定，并可导入其他应用的备份。

## 说明
(以纯文本粘贴，去掉 **。按 Chrome 垃圾信息常见问题，其他产品名称最多 5 个。)

Popout Authenticator 直接在浏览器中显示两步验证(2FA)一次性验证码，可以在工具栏弹出窗口、独立窗口或侧边栏中打开。它生成标准的 TOTP 和 HOTP 验证码，开源(MIT)，不限账户数量，无需注册，也不需要服务器。

**从其他验证器迁移**
- 导入 Authenticator 扩展(authenticator.cc)的备份文件，包括设置了密码的备份。
- 兼容 Google Authenticator™ 导出二维码。
- 导入其他验证器应用的明文备份，以及标准凭据交换(CXF)文件。支持的应用(英文): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- 部分应用的加密备份无法在这里打开。遇到这种情况，请先在该应用中导出明文备份。

**在需要的地方打开**
- 可在工具栏弹出窗口、独立窗口或侧边栏(Firefox 中为侧栏)中打开。
- 搜索、分组、置顶和紧凑视图，让很多账户也能保持整齐。
- 优先显示当前网站对应的账户，可通过单击、右键菜单或快捷键填入验证码。
- 可在你选择的网站上，于验证码输入框旁显示填入按钮。

**多种方式添加账户**
- 从当前标签页、摄像头、图片或剪贴板扫描二维码。
- 粘贴 otpauth:// 链接，或手动输入密钥。
- TOTP 和 HOTP 支持 SHA-1、SHA-256、SHA-512 算法和 6 到 10 位，另外支持 Steam(5 个字符)和 Battle.net(8 位)验证码。

**安全保管**
- 账户保存在本机用 AES-256-GCM 加密的保险库中。设置密码才能保护保险库密钥；没有密码时，密钥与数据一起保存在本机。
- 可以用密码(Argon2id)、恢复码以及通行密钥解锁(Firefox 除外)来锁定，并可选择自动锁定的时机。
- 可以在使用验证码前要求设备验证(Firefox 除外)，也可以用自己设置的快捷键隐藏验证码。
- 没有统计分析、没有广告、没有开发者服务器。源代码公开。

**防止失去访问权限**
- 加密备份，以及导出为 otpauth 文本、CXF 和二维码。
- 通过浏览器自带的同步，在你的设备之间同步(Chrome、Edge、Firefox)。开启密码锁定后会加密传输。
- 恢复快照、30 天回收站和账户更改记录。
- 电脑时间不准导致验证码失效时，时钟检查会提醒你。

**只分享验证码，不分享密钥**
- 可以发送只显示接下来 5 到 60 分钟验证码的链接，并可加密码。链接中不包含密钥。

**须知**
- 没有开发者运营的云备份。备份是你自己保存的文件，同步使用浏览器自带的同步。
- 通行密钥解锁和设备验证在 Firefox 中不可用。Safari 版仅支持 macOS。

支持 20 种语言。支持面向组织的管理策略。

Popout Authenticator 由独立开发者制作，基于 Authenticator 扩展(authenticator.cc)以 MIT 许可发布的代码和翻译，与其作者没有关联。

Google Authenticator 是 Google LLC 的商标。

隐私政策: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
源代码: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `侧边栏(Firefox 中为侧栏)` → `侧边栏`
- `通行密钥解锁(Firefox 除外)` → `通行密钥解锁`
- `设备验证(Firefox 除外)` → `设备验证`
- `通过浏览器自带的同步，在你的设备之间同步(Chrome、Edge、Firefox)。` → `通过 Microsoft Edge 同步，在你的设备之间同步。`
- 이 줄을 뺀다: `- 通行密钥解锁和设备验证在 Firefox 中不可用。Safari 版仅支持 macOS。`
