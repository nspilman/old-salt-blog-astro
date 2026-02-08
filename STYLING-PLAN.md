# Old Salt Blog Styling Plan

## Current State Analysis

### Original WordPress Site (oldsaltblog.com)
| Element | Value |
|---------|-------|
| **Max Width** | 940px container |
| **Layout** | 75% content / 25% sidebar |
| **Primary Link Color** | `#1B8BE0` |
| **Nav Background** | `#000000` (black) |
| **Nav Text** | `#FFFFFF` (white) |
| **Nav Hover** | `#D1D1D1` bg, black text |
| **Body Text** | Black on light backgrounds |
| **Sidebar Borders** | `#D6D6D6` |
| **Footer Border** | `2px solid #888` |
| **Typography** | System fonts (inherited) |
| **Post Display** | Traditional list format |

### Current Astro Site
| Element | Value |
|---------|-------|
| **Max Width** | 720px content, 900px homepage |
| **Layout** | Single column, no sidebar |
| **Primary Link Color** | `#1e5a8e` (darker blue) |
| **Header Background** | White with subtle shadow |
| **Typography** | Atkinson font |
| **Post Display** | Card-based with featured images |

---

## Styling Tasks

### Phase 1: Color Scheme Alignment

#### Task 1.1: Update CSS Variables
**File:** `src/styles/global.css`

```css
:root {
  /* Match WordPress blue */
  --accent: #1B8BE0;
  --accent-dark: #1570B8;
  --accent-light: 220, 235, 250;

  /* Keep existing grays or adjust */
  --black: 0, 0, 0;
  --gray: 96, 115, 159;
  --gray-light: 214, 214, 214; /* Match #D6D6D6 */
  --gray-dark: 34, 41, 57;

  /* New: Nav colors */
  --nav-bg: 0, 0, 0;
  --nav-text: 255, 255, 255;
  --nav-hover-bg: 209, 209, 209;
}
```

#### Task 1.2: Update Link Styling
- Change link color to `#1B8BE0`
- Add bold weight to links (WordPress style)
- Update hover states

---

### Phase 2: Header/Navigation Redesign

#### Task 2.1: Dark Navigation Bar
**File:** `src/components/Header.astro`

Transform from white header to WordPress-style black nav:

**Changes needed:**
- Background: `#000000`
- Text color: `#FFFFFF`
- Hover state: `#D1D1D1` background with black text
- Remove bottom border indicator, use background color instead
- Site title: White, positioned left

**Target CSS:**
```css
header {
  background: #000000;
  padding: 0;
}

nav {
  max-width: 940px;
  margin: 0 auto;
}

nav a {
  color: #FFFFFF;
  padding: 10px 15px;
  font-weight: bold;
}

nav a:hover {
  background: #D1D1D1;
  color: #000000;
}
```

#### Task 2.2: Navigation Links
Add additional nav items to match WordPress:
- Home
- About (create page if needed)
- Archive
- Contact (create page if needed)
- RSS

---

### Phase 3: Layout Changes

#### Task 3.1: Container Width
**Files:** `src/styles/global.css`, all page components

- Increase max-width from 720px to 940px
- Update `main` element styling across pages

#### Task 3.2: Sidebar Implementation (Optional)
**Decision Point:** The WordPress site has a sidebar with:
- Search widget
- Recent Posts
- Categories
- Archives
- Social links

**Options:**
1. **Keep single-column** (modern, mobile-first)
2. **Add sidebar** (match WordPress exactly)
3. **Hybrid** (sidebar on desktop, hidden on mobile)

If adding sidebar, create:
- `src/components/Sidebar.astro`
- `src/layouts/WithSidebar.astro`

---

### Phase 4: Homepage Post List Styling

#### Task 4.1: Post List Format
**File:** `src/pages/index.astro`

**Current:** Card-based with large featured images
**WordPress:** Traditional list with smaller/no images inline

**Option A: Match WordPress exactly**
- Remove cards, use simple list
- Title as link, date below
- Short excerpt
- "Continue reading →" link

**Option B: Modern hybrid (Recommended)**
- Keep cards but adjust styling
- Smaller featured images
- More compact layout
- Match WordPress colors

#### Task 4.2: Post Preview Styling
```css
.post-preview {
  border-bottom: 1px solid #D6D6D6;
  padding: 1.5em 0;
  /* Remove card styling */
  border-radius: 0;
  box-shadow: none;
}

.post-preview h2 a {
  color: #000000;
  font-weight: bold;
}

.post-preview h2 a:hover {
  color: #1B8BE0;
}
```

---

### Phase 5: Single Post Page Styling

#### Task 5.1: Post Title Area
**File:** `src/pages/[slug].astro`

- Left-align title (WordPress style) vs current centered
- Title color: Black, hover blue
- Meta info (date, author) styling

#### Task 5.2: Content Typography
- Adjust line-height
- Link styling within content
- Image presentation (less rounded corners to match WordPress)

#### Task 5.3: Categories/Tags Display
- Match WordPress placement (typically at end of post)
- Blue pill/tag styling

---

### Phase 6: Footer Redesign

#### Task 6.1: Footer Styling
**File:** `src/components/Footer.astro`

**WordPress footer:**
- `2px solid #888` top border
- Simple copyright text
- Minimal styling

**Changes:**
```css
footer {
  border-top: 2px solid #888;
  padding: 2em 1em;
  background: transparent;
  text-align: center;
}
```

---

### Phase 7: Additional Pages

#### Task 7.1: Archive Page Styling
**File:** `src/pages/archive/index.astro`
- Match WordPress archive format
- Year/month groupings

#### Task 7.2: Category/Tag Pages
**Files:** `src/pages/category/[slug].astro`, `src/pages/tag/[slug].astro`
- Consistent styling with homepage

---

### Phase 8: Typography

#### Task 8.1: Font Decision
**Options:**
1. **Keep Atkinson** - Modern, accessible, already set up
2. **Switch to system fonts** - Match WordPress exactly
3. **Use Georgia/serif** - Traditional maritime feel

**Recommendation:** Keep Atkinson for readability, but consider adding a serif option for headings for maritime character.

#### Task 8.2: Font Sizes
| Element | WordPress | Current | Proposed |
|---------|-----------|---------|----------|
| Body | 16px | 20px | 18px |
| H1 | ~2em | 3.052em | 2.5em |
| H2 | ~1.5em | 2.441em | 2em |
| Post Title | ~1.8em | 1.5em | 1.8em |

---

### Phase 9: Responsive Design

#### Task 9.1: Mobile Breakpoints
- 768px: Tablet adjustments
- 640px: Mobile layout (WordPress breakpoint)

#### Task 9.2: Mobile Navigation
- Hamburger menu for mobile
- Collapsible nav

---

## Implementation Order (Recommended)

1. **Phase 1** - Color scheme (quick win, big visual impact)
2. **Phase 2** - Header/Navigation (major brand alignment)
3. **Phase 4** - Homepage post list (main user experience)
4. **Phase 5** - Single post pages
5. **Phase 6** - Footer
6. **Phase 3** - Layout/container width
7. **Phase 8** - Typography fine-tuning
8. **Phase 7** - Additional pages
9. **Phase 9** - Responsive polish

---

## Decision Points Needed

Before implementation, clarify:

1. **Sidebar**: Add sidebar or keep single-column?
2. **Post cards**: Keep modern cards or switch to traditional list?
3. **Typography**: Keep Atkinson or switch to system/serif fonts?
4. **Mobile nav**: Hamburger menu or simplified inline?
5. **Exact replica vs. modernized**: Match WordPress exactly or keep some modern improvements?

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/styles/global.css` | Colors, typography, base styles |
| `src/components/Header.astro` | Dark nav bar |
| `src/components/Footer.astro` | Simpler footer |
| `src/pages/index.astro` | Post list styling |
| `src/pages/[slug].astro` | Post page styling |
| `src/pages/page/[page].astro` | Pagination pages |
| `src/pages/archive/index.astro` | Archive styling |
| `src/pages/category/[slug].astro` | Category pages |
| `src/pages/tag/[slug].astro` | Tag pages |
| `src/components/Pagination.astro` | Pagination styling |
| `src/components/Search.astro` | Search styling |

---

## New Files to Create (if sidebar chosen)

- `src/components/Sidebar.astro`
- `src/components/RecentPosts.astro`
- `src/components/CategoryWidget.astro`
- `src/layouts/WithSidebar.astro`
