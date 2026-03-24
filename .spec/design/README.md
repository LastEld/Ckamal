# Design Specifications

**Path**: `.spec/design/`  
**Purpose**: UI/UX дизайн, mockups, design system

---

## Статус

> ⚠️ **В разработке** - проект в основном backend-focused

## Содержимое

| Тип | Файл | Описание |
|-----|------|----------|
| Dashboard | - | Web dashboard для AMS |
| CLI Interface | - | Командная строка |
| API Design | - | REST/MCP API patterns |

## Dashboard

AMS имеет dashboard в `src/dashboard/`:
- `src/dashboard/public/index.html`
- `src/dashboard/public/app.js`
- `src/dashboard/public/styles.css`

---

## Template: DES-{id}.md

```markdown
# DES-{id}: {Component/Screen Name}

**Type**: Screen | Component | Pattern  
**Platform**: Web | Mobile | Desktop | CLI  
**Status**: Draft | In Review | Approved | Implemented  
**Owner**: @username

---

## Overview

{Description of the design}

## User Flow

```
[Step 1] → [Step 2] → [Step 3]
```

## Layout

### Desktop
```
+------------------+
| Header           |
+------------------+
| Sidebar | Content|
|         |        |
+------------------+
| Footer           |
+------------------+
```

### Mobile
```
+----------+
| Header   |
+----------+
| Content  |
|          |
+----------+
| Nav      |
+----------+
```

## Interactions

| Element | Action | Result |
|---------|--------|--------|
| Button | Click | Navigate |
| Input | Type | Validate |

## States

- Default
- Hover
- Active
- Disabled
- Loading
- Error

## Assets

- Mockup: [link]
- Icons: [link]
- Colors: [link]

## Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support

## Related

- Parent: DES-{id}
- Children: DES-{id}
```
