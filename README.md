# iOPEX Copilot

The iOPEX Copilot is a VSCode extension that helps you to write code faster and more efficiently. It provides you with a set of commands to help you navigate, refactor, and write your code faster.

[VS Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=iOPEX.iopex-copilot)

## Installation
1. Install [Aider](https://github.com/paul-gauthier/aider) via pip: `pip install aider-chat`. This is the backbone for the extension to understand and modify code.
2. Install this VS Code extension.
3. Configure the extension variables in your VS Code settings, adding your OpenAI API key. You can find your API key in your [OpenAI dashboard](https://platform.openai.com/api-keys).
4. Open a project with a Git repository.
5. Run `Cmd-P` (Mac) or `Ctrl-P` (Windows) and type `> Run Open iOpex Copilot`. This will initialize the extension for the current project.

## Features

- **Editing Autonomy**: The extension can create new files and edit existing files. It can also create new functions, classes, and variables, and modify existing ones.
- **Version Control**: The extension can commit changes, and push changes to a remote repository.
- **Question Answering**: The extension can answer questions about your code, such as "What does this function do?" or "What is the return type of this function?"

### Coming soon
- **Code Completion**: The extension will suggest code completions for you as you type. It will also suggest completions for the current line, based on the context of the line.