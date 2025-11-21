# Alfred Translate to Notion

An Alfred workflow that translates text using Google Translate and automatically saves translations to a Notion database with pronunciation information from Cambridge Dictionary.

## Acknowledgment

Big thanks to @xfslove, the original author of this fantastic repository! Your work laid the foundation for this project. Grateful for your contribution! 🚀

🌟 [Original Repository](https://github.com/xfslove/alfred-google-translate)

## Features

- 🌍 Translate text using Google Translate API
- 📚 Automatically save translations to Notion database
- 🔊 Extract pronunciation (IPA) and audio from Cambridge Dictionary
- 🎯 Smart language detection
- 📝 Translation history
- 🎤 Text-to-speech support (remote, local, or none)
- 🔗 Quick access to Cambridge Dictionary links

## Installation

_Requires Alfred 4 or 5 [Powerpack](https://www.alfredapp.com/powerpack/), [Node.js](https://nodejs.org) 8+ (with nvm recommended), and the [alfred-language-configuration](https://github.com/xfslove/alfred-language-configuration) workflow._

### Quick Install (Pre-built Workflow)

1. Download the latest `.alfredworkflow` file from the [Releases](https://github.com/alejots/alfred-google-translate/releases) page
2. Double-click the downloaded file to install it in Alfred
3. Install [alfred-language-configuration](https://github.com/xfslove/alfred-language-configuration) and configure your language pair
4. Configure Notion integration (see [Notion Setup](#notion-setup) below)

### Development Install (From Source)

1. Clone or download this repository:

   ```bash
   git clone https://github.com/alejots/alfred-google-translate.git
   cd alfred-google-translate
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Link the workflow to Alfred:

   ```bash
   npx alfred-link
   ```

4. Install [alfred-language-configuration](https://github.com/xfslove/alfred-language-configuration) and configure your language pair

### Building the Workflow

To create a distributable `.alfredworkflow` file:

```bash
./build.sh
```

This creates a file named `alfred-translate-notion-v{version}.alfredworkflow` that can be shared or distributed.

## Notion Setup

To enable automatic saving to Notion, you have two configuration options:

### Option 1: Alfred Workflow Configuration (Recommended)

1. Create a [Notion integration](https://www.notion.so/my-integrations) and copy your API token
2. Create a Notion database with at least these properties:
   - `Word` (Title)
   - `Status` (Status) - with a "New" option
   - `CambridgeLink` (Rich Text) - optional, for Cambridge Dictionary links
3. Share your database with your integration
4. Copy the database ID from the database URL
5. In Alfred, open the workflow and click the **[𝒙]** button (top right) to access **Configure Workflow**
6. Enter your Notion API Token and Database ID in the configuration fields

### Option 2: Manual Configuration File

Alternatively, you can use a `config.json` file:

1. Follow steps 1-4 from Option 1
2. Copy `config.example.json` to `config.json` in the workflow directory
3. Add your Notion token and database ID to `config.json`:

```json
{
  "token": "YOUR_NOTION_API_TOKEN_HERE",
  "database_id": "YOUR_NOTION_DATABASE_ID_HERE"
}
```

**Note:** Translations with more than 10 words will not be saved to Notion automatically.

## Usage

Alfred workflow Keyword: `tr [word or sentence]`
Example: `tr kitchen sink` or `tr Hello, my name is Alfred`

When translating a word you will see the translation as well as alternate translations if available.

With the first two results (which are the input word and the translation) you can…

- press <kbd>enter</kbd> to read the item.
- press <kbd>cmd</kbd>+<kbd>C</kbd> to copy the item.
- press <kbd>shift</kbd> open the translate website.
- press <kbd>cmd</kbd>+<kbd>L</kbd> to show the translation in large text.

The workflow will attempt to correct spelling mistakes which can be accepted with <kbd>enter</kbd>.

## Troubleshooting

### Node.js Not Found Error

If you see "command not found: node" when using the workflow:

1. The workflow automatically sources nvm if available
2. Make sure Node.js is installed via [nvm](https://github.com/nvm-sh/nvm) or [Homebrew](https://brew.sh/)
3. For nvm users, ensure you have a default version set:
   ```bash
   nvm alias default node
   ```
4. After making changes, re-link the workflow:
   ```bash
   npx alfred-link
   ```

### Notion Integration Not Working

- Verify your Notion token and database ID are correct
- Ensure the database is shared with your integration
- Check that the database has the required properties: `Word` (Title) and `Status` (Status)
- Translations longer than 10 words are automatically skipped

## Environment Variables

| name        | default value                | description                                                                                                                                                                                                                                          |
| ----------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain      | https://translate.google.com | if you cannot access the default domain, you can config this. <br />大陆访问不了默认域名，所以如果使用 2.x 版本需要将这个变量设置为https://translate.google.cn. 或者还是使用[1.x 版本](https://github.com/xfslove/alfred-google-translate/tree/v1.x) |
| voice       | remote                       | avaliable values: <br />remote: fetch voice from google, <br />local: use macOS local voice (notice: maybe only works on English),<br />none: dont use voice                                                                                         |
| save_count  | 20                           | limit the translation history, see [alfred-translate-history](https://github.com/xfslove/alfred-translate-history). <br />a value of 0 will keep no history                                                                                          |
| socks_proxy | -                            | not turned by default. you can specify local or remote socks proxy. format: `socks://{host}:{port}` example: local shadowsocks proxy 'socks://127.0.0.1:1086'                                                                                        |

##### environment variables config snapshot:

![env-config.png](media/env-config.png)

![env.png](media/env.png)

## Hotkey

If you download the workflow, you may have to manually set the hotkey yourself.

##### hotkey config snapshot:

![hotkey.png](media/hotkey.png)

![hotkey-config.png](media/hotkey-config.png)

##### hotkey and largetype snapshot:

![result](media/result.gif)

## Screenshots

![](media/detect-lang.png)

![corrected.png](media/corrected.png)

- press <kbd>enter</kbd> to read or <kbd>cmd</kbd>+<kbd>C</kbd> to copy

  ![general.png](media/general.png)

- press <kbd>shift</kbd> to open the translation website

  ![quicklook.png](media/quicklook.png)

- press <kbd>cmd</kbd>+<kbd>L</kbd> to show the translation in large text [like this](#hotkey-and-largetype-snapshot).

## Related

- [alfy](https://github.com/sindresorhus/alfy) - Create Alfred workflows with ease
- [google-translate-api](https://github.com/vitalets/google-translate-api) - A free and unlimited API for Google Translate
- [@notionhq/client](https://github.com/makenotion/notion-sdk-js) - Official Notion JavaScript SDK

## License

MIT © [alejots](https://github.com/alejots)

Original work © [xfslove](https://github.com/xfslove)
