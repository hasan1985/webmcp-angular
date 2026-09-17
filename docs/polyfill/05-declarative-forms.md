[← validation and access](./04-validation-and-access.md) · [contents](./README.md) · next: [What it means for webmcp-angular →](./06-for-webmcp-angular.md)

# 5. Declarative forms

`src/declarative-forms.ts` — the largest file, implementing the draft's second
registration path: an annotated `<form>` *is* a tool. Angular 22 targets this surface
with `provideExperimentalWebMcpForms`; `webmcp-angular` does not wrap it, but the
polyfill installs it whenever it owns `document.modelContext`, so it is running under
every playground page.

## Markup → tool

```html
<form toolname="search_catalog" tooldescription="Search the product catalog" toolautosubmit>
  <label>Words to match <input name="query" required /></label>
  <select name="sort"><option>relevance</option><option>price</option></select>
  <button type="submit">Search</button>
</form>
```

becomes

```json
{
  "name": "search_catalog",
  "title": "",
  "description": "Search the product catalog",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "Words to match"},
      "sort":  {"type": "string", "enum": ["relevance", "price"]}
    },
    "required": ["query"]
  }
}
```

### Schema synthesis, per named control group

| Control | Schema |
|---|---|
| `text`, `email`, `password`, `search`, `tel`, `url`, `<textarea>` | `string`, plus `pattern` if valid |
| `number` | `number` with `minimum` / `maximum` / `multipleOf` from `min` / `max` / `step` |
| `range` | as `number`, defaulting to 0–100 |
| `checkbox` (one) | `boolean` |
| `checkbox` (group, same `name`) | `array` of `string` enum, `uniqueItems` |
| `radio` (group) | `string` enum |
| `<select>` / `<select multiple>` | `string` enum / `array` of it |
| `date`, `month`, `week`, `time`, `datetime-local`, `color` | `string` with a `format` regex |
| `hidden` | only if it carries `toolparamdescription` |
| disabled, read-only, `file`, `submit`, `button` | skipped |

Description comes from `toolparamdescription`, else the `<label>` text (with nested
controls stripped), else `aria-description`; a group takes it from a common
`<fieldset>`. `required` on any control in the group marks the parameter required.

## Keeping the registry in sync with the DOM

```mermaid
sequenceDiagram
    autonumber
    participant DOM
    participant Obs as MutationObserver
    participant DF as sync()
    participant MC as modelContext

    Note over Obs: one per root — the document,<br/>plus every open shadow root found or attached later

    DOM->>Obs: childList / attributes / characterData, subtree
    Obs->>DF: sync()
    DF->>DF: walk every root, collect connected forms with toolname + tooldescription
    DF->>DF: definition = toolDefinition(form), fingerprint = JSON.stringify(definition)
    alt name already claimed by another form
        DF->>DF: block this form until the other goes away or its definition changes
    end
    loop existing registrations
        DF->>DF: fingerprint changed or form gone?
        DF->>MC: controller.abort() — tool removed, pending call cancelled
    end
    loop newly selected forms
        DF->>MC: registerTool({name, title, description, inputSchema, execute}, {signal})
    end
```

Two prototype patches make this complete: `Element.prototype.attachShadow` is wrapped
so a *new* open shadow root gets an observer the moment it exists, and
`HTMLFormElement.prototype.submit` is wrapped so a programmatic `form.submit()`
(which fires no `submit` event) still settles a pending call. Both are restored on
cleanup. Closed shadow roots cannot be inspected.

## A call: fill, submit, respond

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant MC as modelContext
    participant DF as execute(input)
    participant Form
    participant Page as page's submit listener

    Agent->>MC: executeTool(search_catalog, '{"query":"shoes","sort":"price"}')
    MC->>DF: execute(input)
    DF->>DF: validate every value against its control — else TypeError
    DF->>Form: fillForm — set native value/checked, dispatch input + change
    alt toolautosubmit
        DF->>Form: requestSubmit(submitter) — runs constraint validation
        Form-->>DF: invalid → UnknownError "Form validation failed: field: message"
    else no toolautosubmit
        DF->>Form: focus the submit button
        DF->>DF: window.dispatchEvent('toolactivated')
        Note over Form: waits for the user to press submit
    end
    Form->>Page: submit (capture) — event.agentInvoked === true
    alt page calls event.preventDefault() + event.respondWith(promise)
        Page-->>DF: the promise's value becomes the tool result
    else page calls preventDefault() only
        DF-->>MC: UnknownError "preventDefault() requires respondWith()"
    else page lets it through
        Note over Form: normal navigation/submission
        DF-->>MC: resolves undefined
    end
```

Values are set through the **native** `value` / `checked` setters, then `input` and
`change` are dispatched — so a framework listening for those (Angular's forms, React's
synthetic events) sees the change as if typed. Validation is against what the control
would accept (a probe `<input>` of the same type), not against the synthesized schema.

A pending call is cancelled — with `UnknownError` — if the form is reset, its
definition changes, it leaves the DOM, or the polyfill is cleaned up. Only one call per
form is pending at a time; a second cancels the first.

## `SubmitEvent.agentInvoked` and `respondWith`

Installed on `SubmitEvent.prototype` at init. `agentInvoked` is `true` only for a
trusted submit on a form with a running tool call — ordinary user submissions are
never attributed to the agent (a 5.0 fix). `respondWith(promise)` throws
`InvalidStateError` unless the event is agent-invoked, `preventDefault()` was called,
and dispatch is still in progress.

## What is not emulated

From the package README: native CSS tool-state pseudo-classes, `toolcancel`,
responses that survive a navigation, file inputs, custom form-associated elements,
closed shadow roots. Chrome's declarative implementation is ahead of the draft's text
here; the polyfill tracks the upstream Web Platform Tests instead.

---

next: [What it means for webmcp-angular →](./06-for-webmcp-angular.md)
