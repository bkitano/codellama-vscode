import * as vscode from "vscode";
import { ChatGPTAPI, ChatMessage } from "chatgpt";
import fetch from "node-fetch";
import { AiderState } from "./utils";

type AuthInfo = { apiKey?: string };
type Settings = {
  selectedInsideCodeblock?: boolean;
  codeblockWithLanguageId?: false;
  pasteOnClick?: boolean;
  keepConversation?: boolean;
  timeoutLength?: number;
  model?: string;
  apiUrl?: string;
};

const BASE_URL = "https://api.openai.com/v1";

export function activate(context: vscode.ExtensionContext) {
  console.log('activating extension "iopex"');
  // Get the settings from the extension's configuration
  const config = vscode.workspace.getConfiguration("iopex");

  // Create a new ChatGPTViewProvider instance and register it with the extension's context
  const provider = new ChatGPTViewProvider(context.extensionUri);

  // Put configuration settings into the provider
  provider.setAuthenticationInfo({
    apiKey: config.get("apiKey"),
  });
  provider.setSettings({
    selectedInsideCodeblock: config.get("selectedInsideCodeblock") || false,
    codeblockWithLanguageId: config.get("codeblockWithLanguageId") || false,
    pasteOnClick: config.get("pasteOnClick") || false,
    keepConversation: config.get("keepConversation") || false,
    timeoutLength: config.get("timeoutLength") || 60,
    apiUrl: config.get("apiUrl") || BASE_URL,
    model: config.get("model") || "gpt-3.5-turbo",
  });

  // Register the provider with the extension's context
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatGPTViewProvider.webviewId,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  const commandHandler = (command: string) => {
    const config = vscode.workspace.getConfiguration("iopex");
    const prompt = config.get(command) as string;
    provider.search(prompt);
  };

  const aiderState = new AiderState();

  // Register the commands that can be called from the extension's package.json
  context.subscriptions.push(
    vscode.commands.registerCommand("iopex.ask", () =>
      vscode.window
        .showInputBox({ prompt: "What do you want to do?" })
        .then((value) => provider.search(value))
    ),
    vscode.commands.registerCommand("iopex.refactor", () =>
      commandHandler("promptPrefix.refactor")
    ),
    vscode.commands.registerCommand("iopex.explain", () =>
      commandHandler("promptPrefix.explain")
    ),
    vscode.commands.registerCommand("iopex.unitTest", () =>
      commandHandler("promptPrefix.unitTest")
    ),
    vscode.commands.registerCommand("iopex.findProblems", () =>
      commandHandler("promptPrefix.findProblems")
    ),
    vscode.commands.registerCommand("iopex.documentation", () =>
      commandHandler("promptPrefix.documentation")
    ),
    vscode.commands.registerCommand("iopex.resetConversation", () =>
      provider.resetConversation()
    ),

    // -------------------------- AIDER COMMANDS ----------------------------------

    // make this just run at startup automatically
    vscode.commands.registerCommand("aider.open", () => {
      if (!aiderState.aider) {
        aiderState.createAider();
        return;
      }

      if (aiderState.aider) {
        aiderState.aider.show();
      }
    }),
    vscode.commands.registerCommand("aider.syncFiles", () => {
      if (!aiderState.aider) {
        vscode.window.showErrorMessage(
          "Aider is not running.  Please run the 'Open Aider' command first."
        );
        return;
      }

      aiderState.syncAiderAndVSCodeFiles();
    }),
    vscode.commands.registerCommand("aider.add", () => {
      console.log("Aider: adding file");
      if (!aiderState.aider) {
        vscode.window.showErrorMessage(
          "Aider is not running.  Please run the 'Open Aider' command first."
        );
      }

      // The code you place here will be executed every time your command is executed
      // Get the currently selected file in VS Code
      let activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return; // No open text editor
      }
      let filePath = activeEditor.document.fileName;

      // Send the "/add <filename>" command to the Aider process
      if (aiderState.aider) {
        aiderState.filesThatAiderKnows.add(filePath);
        aiderState.aider.addFile(filePath);
      }
    }),
    vscode.commands.registerCommand("aider.drop", () => {
      if (!aiderState.aider) {
        vscode.window.showErrorMessage(
          "Aider is not running.  Please run the 'Open Aider' command first."
        );
      }

      // The code you place here will be executed every time your command is executed
      // Get the currently selected file in VS Code
      let activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return; // No open text editor
      }
      let filePath = activeEditor.document.fileName;

      // Send the "/drop <filename>" command to the Aider process
      if (aiderState.aider) {
        aiderState.filesThatAiderKnows.delete(filePath);
        aiderState.aider.dropFile(filePath);
      }
    }),
    vscode.commands.registerCommand("aider.close", () => {
      console.log("Aider: closing");
      if (!aiderState.aider) {
        vscode.window.showErrorMessage(
          "Aider is not running.  Please run the 'Open Aider' command first."
        );
      }

      // The code you place here will be executed every time your command is executed
      // Terminate the Aider process
      if (aiderState.aider) {
        aiderState.aider.dispose();
        aiderState.aider = null;
      }
    })
  );

  // ---------- event listeners ----------

  vscode.workspace.onDidOpenTextDocument((document) => {
    if (aiderState.aider) {
      if (
        document.uri.scheme === "file" &&
        document.fileName &&
        aiderState.aider.isWorkspaceFile(document.fileName)
      ) {
        let filePath = document.fileName;
        let ignoreFiles =
          (vscode.workspace
            .getConfiguration("iopex")
            .get("ignoreFiles") as string[]) || [];
        let shouldIgnore = ignoreFiles.some((regex) =>
          new RegExp(regex).test(filePath)
        );

        if (!shouldIgnore) {
          aiderState.aider.addFile(filePath);
          aiderState.filesThatAiderKnows.add(document.fileName);
        }
      }
    }
  });

  vscode.workspace.onDidCloseTextDocument((document) => {
    if (aiderState.aider) {
      if (
        document.uri.scheme === "file" &&
        document.fileName &&
        aiderState.aider.isWorkspaceFile(document.fileName)
      ) {
        let filePath = document.fileName;
        let ignoreFiles =
          (vscode.workspace
            .getConfiguration("aider")
            .get("ignoreFiles") as string[]) || [];
        let shouldIgnore = ignoreFiles.some((regex) =>
          new RegExp(regex).test(filePath)
        );

        if (!shouldIgnore) {
          aiderState.aider.dropFile(filePath);
          aiderState.filesThatAiderKnows.delete(document.fileName);
        }
      }
    }
  });

  // Change the extension's session token or settings when configuration is changed
  vscode.workspace.onDidChangeConfiguration(
    (event: vscode.ConfigurationChangeEvent) => {
      if (event.affectsConfiguration("iopex.apiKey")) {
        const config = vscode.workspace.getConfiguration("iopex");
        provider.setAuthenticationInfo({ apiKey: config.get("apiKey") });
      } else if (event.affectsConfiguration("iopex.apiUrl")) {
        const config = vscode.workspace.getConfiguration("iopex");
        let url = (config.get("apiUrl") as string) || BASE_URL;
        provider.setSettings({ apiUrl: url });
      } else if (event.affectsConfiguration("iopex.model")) {
        const config = vscode.workspace.getConfiguration("iopex");
        provider.setSettings({ model: config.get("model") || "gpt-3.5-turbo" });
      } else if (event.affectsConfiguration("iopex.selectedInsideCodeblock")) {
        const config = vscode.workspace.getConfiguration("iopex");
        provider.setSettings({
          selectedInsideCodeblock:
            config.get("selectedInsideCodeblock") || false,
        });
      } else if (event.affectsConfiguration("iopex.codeblockWithLanguageId")) {
        const config = vscode.workspace.getConfiguration("iopex");
        provider.setSettings({
          codeblockWithLanguageId:
            config.get("codeblockWithLanguageId") || false,
        });
      } else if (event.affectsConfiguration("iopex.pasteOnClick")) {
        const config = vscode.workspace.getConfiguration("iopex");
        provider.setSettings({
          pasteOnClick: config.get("pasteOnClick") || false,
        });
      } else if (event.affectsConfiguration("iopex.keepConversation")) {
        const config = vscode.workspace.getConfiguration("chatgpt");
        provider.setSettings({
          keepConversation: config.get("keepConversation") || false,
        });
      } else if (event.affectsConfiguration("iopex.timeoutLength")) {
        const config = vscode.workspace.getConfiguration("iopex");
        provider.setSettings({
          timeoutLength: config.get("timeoutLength") || 60,
        });
      }
    }
  );
}

class ChatGPTViewProvider implements vscode.WebviewViewProvider {
  public static readonly webviewId = "iopex.chatView"; // has to match the id in package.json/contributes/views/c
  private _view?: vscode.WebviewView;

  private _chatGPTAPI?: ChatGPTAPI;
  private _conversation?: any;

  private _response?: string;
  private _prompt?: string;
  private _fullPrompt?: string;
  private _currentMessageNumber = 0;

  private _settings: Settings = {
    selectedInsideCodeblock: false,
    codeblockWithLanguageId: false,
    pasteOnClick: true,
    keepConversation: true,
    timeoutLength: 60,
    apiUrl: BASE_URL,
    model: "gpt-3.5-turbo",
  };
  private _authInfo?: AuthInfo;

  // In the constructor, we store the URI of the extension
  constructor(private readonly _extensionUri: vscode.Uri) {}

  // Set the API key and create a new API instance based on this key
  public setAuthenticationInfo(authInfo: AuthInfo) {
    this._authInfo = authInfo;
    this._newAPI();
  }

  public setSettings(settings: Settings) {
    let changeModel = false;
    if (settings.apiUrl || settings.model) {
      changeModel = true;
    }
    this._settings = { ...this._settings, ...settings };

    if (changeModel) {
      this._newAPI();
    }
  }

  public getSettings() {
    return this._settings;
  }

  // This private method initializes a new ChatGPTAPI instance
  private _newAPI() {
    console.log("New API");
    if (!this._authInfo || !this._settings?.apiUrl) {
      console.warn(
        "API key or API URL not set, please go to extension settings (read README.md for more info)"
      );
    } else {
      this._chatGPTAPI = new ChatGPTAPI({
        apiKey: this._authInfo.apiKey || "xx",
        apiBaseUrl: this._settings.apiUrl,
        completionParams: { model: this._settings.model || "gpt-3.5-turbo" },
      });
      // console.log( this._chatGPTAPI );
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // set options for the webview, allow scripts
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // set the HTML for the webview
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // add an event listener for messages received by the webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "codeSelected": {
          // do nothing if the pasteOnClick option is disabled
          if (!this._settings.pasteOnClick) {
            break;
          }
          let code = data.value;
          const snippet = new vscode.SnippetString();
          snippet.appendText(code);
          // insert the code as a snippet into the active text editor
          vscode.window.activeTextEditor?.insertSnippet(snippet);
          break;
        }
        case "prompt": {
          this.search(data.value);
        }
      }
    });
  }

  public async resetConversation() {
    console.log(this, this._conversation);
    if (this._conversation) {
      this._conversation = null;
    }
    this._prompt = "";
    this._response = "";
    this._fullPrompt = "";
    this._view?.webview.postMessage({ type: "setPrompt", value: "" });
    this._view?.webview.postMessage({ type: "addResponse", value: "" });
  }

  public async search(prompt?: string) {
    this._prompt = prompt;
    if (!prompt) {
      prompt = "";
    }

    // Check if the ChatGPTAPI instance is defined
    if (!this._chatGPTAPI) {
      this._newAPI();
    }

    // focus gpt activity from activity bar
    if (!this._view) {
      await vscode.commands.executeCommand("iopex.chatView.focus");
    } else {
      this._view?.show?.(true);
    }

    let response = "";
    this._response = "";
    // Get the selected text of the active editor
    const selection = vscode.window.activeTextEditor?.selection;
    const selectedText =
      vscode.window.activeTextEditor?.document.getText(selection);
    // Get the language id of the selected text of the active editor
    // If a user does not want to append this information to their prompt, leave it as an empty string
    const languageId =
      (this._settings.codeblockWithLanguageId
        ? vscode.window.activeTextEditor?.document?.languageId
        : undefined) || "";
    let searchPrompt = "";

    if (selection && selectedText) {
      // If there is a selection, add the prompt and the selected text to the search prompt
      if (this._settings.selectedInsideCodeblock) {
        searchPrompt = `${prompt}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
      } else {
        searchPrompt = `${prompt}\n${selectedText}\n`;
      }
    } else {
      // Otherwise, just use the prompt if user typed it
      searchPrompt = prompt;
    }
    this._fullPrompt = searchPrompt;

    // Increment the message number
    this._currentMessageNumber++;
    let currentMessageNumber = this._currentMessageNumber;

    if (!this._chatGPTAPI) {
      response =
        '[ERROR] "API key not set or wrong, please go to extension settings to set it (read README.md for more info)"';
    } else {
      // If successfully signed in
      console.log("sendMessage");

      // Make sure the prompt is shown
      this._view?.webview.postMessage({
        type: "setPrompt",
        value: this._prompt,
      });
      this._view?.webview.postMessage({ type: "addResponse", value: "..." });

      const agent = this._chatGPTAPI;

      try {
        let res: ChatMessage;
        console.log(this._prompt?.slice(0, 6));
        if (this._prompt?.slice(0, 6) === "/iopex") {
          console.log("iopex command");
          this._prompt = this._prompt.slice(7);

          const customEndpoint = "https://bkitano--iopex-llama-chat.modal.run";
          const body = {
            messages: [
              {
                id: "asdf",
                content: this._prompt,
                role: "user",
              },
            ],
          };

          const response = await fetch(customEndpoint, {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          });

          res = {
            id: "asdf",
            text: JSON.parse(await response.text()).message,
            role: "assistant",
          };
        } else {
          // Send the search prompt to the ChatGPTAPI instance and store the response
          res = await agent.sendMessage(searchPrompt, {
            onProgress: (partialResponse) => {
              // If the message number has changed, don't show the partial response
              if (this._currentMessageNumber !== currentMessageNumber) {
                return;
              }
              console.log("onProgress");
              if (this._view && this._view.visible) {
                response = partialResponse.text;
                this._response = response;
                this._view.webview.postMessage({
                  type: "addResponse",
                  value: response,
                });
              }
            },
            timeoutMs: (this._settings.timeoutLength || 60) * 1000,
            ...this._conversation,
          });
        }

        if (this._currentMessageNumber !== currentMessageNumber) {
          return;
        }

        console.log(res);

        response = res.text;
        if (res.detail?.usage?.total_tokens) {
          response += `\n\n---\n*<sub>Tokens used: ${res.detail.usage.total_tokens} (${res.detail.usage.prompt_tokens}+${res.detail.usage.completion_tokens})</sub>*`;
        }

        if (this._settings.keepConversation) {
          this._conversation = {
            parentMessageId: res.id,
          };
        }
      } catch (e: any) {
        console.error(e);
        if (this._currentMessageNumber === currentMessageNumber) {
          response = this._response;
          response += `\n\n---\n[ERROR] ${e}`;
        }
      }
    }

    if (this._currentMessageNumber !== currentMessageNumber) {
      return;
    }

    // Saves the response
    this._response = response;

    // Show the view and send a message to the webview with the response
    if (this._view) {
      this._view.show?.(true);
      this._view.webview.postMessage({ type: "addResponse", value: response });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const microlightUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "scripts",
        "microlight.min.js"
      )
    );
    const tailwindUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "scripts",
        "showdown.min.js"
      )
    );
    const showdownUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "scripts",
        "tailwind.min.js"
      )
    );

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script src="${tailwindUri}"></script>
				<script src="${showdownUri}"></script>
				<script src="${microlightUri}"></script>
				<style>
				.code {
					white-space: pre;
				}
				p {
					padding-top: 0.3rem;
					padding-bottom: 0.3rem;
				}
				/* overrides vscodes style reset, displays as if inside web browser */
				ul, ol {
					list-style: initial !important;
					margin-left: 10px !important;
				}
				h1, h2, h3, h4, h5, h6 {
					font-weight: bold !important;
				}
				</style>
			</head>
			<body>
				<input class="h-10 w-full text-white bg-stone-700 p-4 text-sm" placeholder="Ask iOpex Copilot" id="prompt-input" />
				
				<div id="response" class="pt-4 text-sm">
				</div>

				<script src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
