# Claude Task Checklist & Model Selection

**This is a mandatory checklist. Claude must follow this before starting ANY work on Slices 7–12.**

---

## ✅ BEFORE Starting Any Slice or Subtask

### Step 1: Identify the Task
- [ ] What slice/feature am I about to work on?
- [ ] Is it in the "Next To Do" section of tasks.md?

### Step 2: Check Model Assignment
- [ ] Open `docs/MODEL_SELECTION.md`
- [ ] Find the slice in the "Slice Assignments" section
- [ ] Note the assigned Claude model (Opus 5, Sonnet 5, or Haiku 4.5)

### Step 3: Ask the User (MANDATORY)
**Claude must output this question before proceeding:**

```
I'm about to work on [SLICE X: DESCRIPTION].

According to MODEL_SELECTION.md, this slice requires **[MODEL NAME]**.

Have you verified that **[MODEL NAME]** is currently selected in your Claude settings?

(This is a required check — I cannot proceed without confirmation.)
```

### Step 4: Wait for Confirmation
- [ ] User confirms the model is selected
- [ ] User corrects model selection if needed
- [ ] Do NOT proceed until confirmed

### Step 5: Proceed
- [ ] Model confirmed
- [ ] Start work on the slice
- [ ] Track progress in comments/docs

---

## 🔄 WHEN Suggesting a Subtask

If you discover a subtask (e.g., "write tests", "update API docs"), analyze it:

1. **Is it the same model as the parent slice?**
   - If YES → proceed with same model, no need to ask again
   - If NO → ask the user about switching models

2. **If model differs**, ask:
```
This subtask (name: [SUBTASK]) needs **[DIFFERENT MODEL]** instead of [PARENT MODEL].
Should I switch, or continue with [PARENT MODEL]?
```

3. **Wait for user decision** before proceeding

---

## 📋 Quick Model Reference

| Model | Best For | When to Use |
|-------|----------|------------|
| **Opus 5** | Complex validation, large UI systems | Slices 8 & 12 |
| **Sonnet 5** | Most APIs, business logic, tests | Slices 7, 9, 10 |
| **Haiku 4.5** | Simple CRUD, docs | Slice 11 |

See `docs/MODEL_SELECTION.md` for full details.

---

## 🎯 Slice-by-Slice Model Map

```
Slice 7 → SONNET 5 (next)
Slice 8 → OPUS 5 (high complexity)
Slice 9 → SONNET 5
Slice 10 → SONNET 5
Slice 11 → HAIKU 4.5
Slice 12 → OPUS 5 (largest scope)
```

---

## ❌ What Claude Should NOT Do

- ❌ Start work without asking about model selection
- ❌ Assume the model from the last task is still selected
- ❌ Skip the confirmation step "because I just switched"
- ❌ Proceed if user doesn't respond to the model check
- ❌ Switch models without asking the user

---

## ✅ What Claude SHOULD Do

- ✅ Check MODEL_SELECTION.md before every slice
- ✅ Ask the user explicitly (copy the template above)
- ✅ Wait for confirmation
- ✅ If user hasn't switched models, gently remind them to do so
- ✅ Be helpful: "Model selection is important for code quality — here's how to change it in Claude settings: [link/directions]"

---

## Example: Starting Slice 7

**User:** "Let's start Slice 7."

**Claude:**
```
I'm about to work on Slice 7: Day-detail endpoint (GET /calendar/:date).

According to MODEL_SELECTION.md, this slice requires **Sonnet 5**.

Have you verified that **Sonnet 5** is currently selected in your Claude settings?

(This is a required check — I cannot proceed without confirmation.)
```

**User:** "Yes, Sonnet 5 is selected."

**Claude:** Proceeds with Slice 7.

---

## Example: Discovering a Subtask Needs a Different Model

**Claude:** "I see we need to update API docs for this endpoint. API docs are usually Haiku 4.5 work (low complexity). We're currently in Sonnet 5. Should I:
- A) Switch to Haiku for the docs, then switch back to Sonnet?
- B) Stay in Sonnet for consistency?

Your call — both work."

---

## For Future Reference

This checklist applies to **all remaining slices and subtasks** (Slices 7–12 and beyond). It's not a one-time thing — it's the standard process for every piece of work.

If you ever ask Claude to do something and Claude doesn't ask about model selection, remind Claude: "Hey, check MODEL_SELECTION.md and ask me about the model first."

---

**Last updated:** 2026-08-24
**Applies to:** Slices 7–12 and all future work
