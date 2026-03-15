# Copilot Model Recommendation Rules

- Alert the user if a task seems too complex for the current model.
- Recommend switching to a more advanced model for architecture, algorithms, or debugging.
- Remind the user to use a cheaper model for repetitive or boilerplate tasks.
- Use the following model cost multipliers and capability notes to guide recommendations:

| Model                | Cost Multiplier | Relative Capabilities                                                                 |
|----------------------|----------------|--------------------------------------------------------------------------------------|
| Claude Opus 4.6      | 3x             | Most advanced Anthropic model; excels at reasoning, long context, nuanced code/design |
| Claude Sonnet 4.6    | 1x             | Strong generalist; good for most coding, design, and reasoning tasks                  |
| Claude Haiku 4.5     | 0.33x          | Fast, low-cost; best for simple code, boilerplate, or high-volume tasks               |
| GPT-4.1              | 0x             | Advanced OpenAI model; strong at code, reasoning, and general tasks                   |
| GPT-5.3-Codex        | 1x             | Next-gen code-focused; excels at code generation, refactoring, and completion         |
| GPT-5.4              | 1x             | Latest OpenAI; strong at code, reasoning, and general tasks                           |
| Grok Code Fast       | 0.25x          | Fast, low-cost; best for simple code, boilerplate, or high-volume tasks               |
| Raptor Mini (preview)| 0x             | Experimental; very fast, best for trivial or bulk code generation                     |

# Usage
- These rules are to be applied proactively by the Copilot agent when reviewing user requests and current model selection.

