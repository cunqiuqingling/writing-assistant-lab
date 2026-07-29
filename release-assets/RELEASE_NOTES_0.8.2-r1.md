# Writing Assistant 0.8.2-R1

0.8.2-R1 is an acceptance hotfix for provider switching, Chinese-first AI analysis, result layout and external-AI feedback guidance.

## Provider profiles and credentials

- Saves Base URL, endpoint, model, output settings and API Key separately for each provider.
- Restores the previously saved profile when switching providers.
- Never reuses one provider's key for another provider.
- Unlocks and removes encrypted keys only for the currently selected provider.
- Migrates the former single configuration and key to the detected provider profile.
- Keeps “Clear all AI configuration and keys” as the explicit all-provider reset.

## Zhipu GLM

- Adds `Zhipu GLM / 智谱` as a built-in preset.
- Uses `https://open.bigmodel.cn/api/paas/v4` with `/chat/completions`.
- Defaults to `glm-4.7-flash`.
- Disables Thinking for connection tests and reference analysis.
- Raises the connection-test output allowance from 12 to 64 tokens.
- Reports a specific error when a service returns reasoning without final text.

## Chinese-first reference analysis

- Makes Simplified Chinese the primary explanation language when Chinese mode is selected.
- Keeps necessary English quotations, examples and templates, followed by Chinese meanings.
- Prevents mixed fragments such as “Common搭配”.
- Adds grammar self-check rules for finite verbs, main-clause boundaries, clause introducers and phrase types.
- Includes a specific safeguard against falsely labelling a prepositional phrase as an infinitive phrase.

## Result layout and security

- Replaces the raw `<pre>` result area with a restricted Markdown renderer.
- Supports headings, lists, quotations, emphasis and code blocks.
- Escapes all text and constructs DOM nodes instead of accepting arbitrary HTML.
- Improves wrapping, spacing and mobile readability.

## External AI feedback copy

- Renames copy actions so their purpose is visible.
- Adds an in-product “复制后怎么用？” guide.
- Copies reference text, learner writing, notes and mode-specific feedback instructions.
- Makes clear that copying writes only to the clipboard and does not automatically call or send data to any AI service.

## Compatibility

- Practice storage schema remains version 5.
- Existing practice data, imported materials, folders, notes and progress are preserved.
- Existing AI configuration is migrated instead of discarded.
- The optional advanced OCR companion remains version 0.8.0 and compatible.
