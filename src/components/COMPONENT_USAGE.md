# Component Usage Guide

## EmployeeAvatarStack

Displays a horizontal stack of employee avatars with overflow indicator.

### Props

```typescript
interface EmployeeAvatarStackProps {
    employees: Array<{ id: string; name: string }>
    maxVisible?: number  // Default: 3
    size?: 'sm' | 'md'   // Default: 'sm'
}
```

### Example Usage

```tsx
import EmployeeAvatarStack from '@/components/EmployeeAvatarStack'

// Basic usage
<EmployeeAvatarStack
    employees={[
        { id: '1', name: 'Alice Meyer' },
        { id: '2', name: 'Bob Schmidt' },
        { id: '3', name: 'Carol Thompson' }
    ]}
/>

// With overflow
<EmployeeAvatarStack
    employees={[
        { id: '1', name: 'Alice M.' },
        { id: '2', name: 'Bob S.' },
        { id: '3', name: 'Carol T.' },
        { id: '4', name: 'Dave K.' },
        { id: '5', name: 'Eve L.' }
    ]}
    maxVisible={3}
    size="md"
/>
// Renders: [AM] [BS] [CT] [+2]
```

### Features

- Automatic initial extraction (first letters of first two words)
- Color rotation through 6 preset colors
- Hover effect with scale animation
- Tooltip on hover showing full name
- Border separation for overlapping avatars
- "+N" indicator for overflow

---

## SignatureProgress

Displays signature progress as a badge or circular indicator.

### Props

```typescript
interface SignatureProgressProps {
    completed: number
    total: number
    variant?: 'circle' | 'text'  // Default: 'text'
    size?: 'sm' | 'md'           // Default: 'sm'
}
```

### Example Usage

```tsx
import SignatureProgress from '@/components/SignatureProgress'

// Text badge (default)
<SignatureProgress completed={2} total={3} />
// Renders: [2/3] with gray background

<SignatureProgress completed={3} total={3} />
// Renders: [✓ 3/3] with green background

// Circular variant
<SignatureProgress
    completed={2}
    total={3}
    variant="circle"
    size="md"
/>
// Renders: Circular progress ring with "2/3" in center
```

### Features

- **Text variant**: Compact badge with optional checkmark
- **Circle variant**: Progress ring with percentage fill
- Auto-styling for completed state (green + checkmark)
- Tooltip showing progress details
- Smooth transitions on state change
- Accessibility-friendly colors (high contrast)

### Color States

- **Incomplete**: Gray background (`bg-neutral-700`)
- **Complete**: Green background (`bg-emerald-500/20`) with checkmark icon

---

## Usage in Team Timesheets Page

```tsx
// Example integration in a table row
<tr className="hover:bg-neutral-800 transition-colors">
    <td className="px-4 py-3">
        <div className="flex items-center gap-3">
            <EmployeeAvatarStack
                employees={team.employees}
                maxVisible={3}
                size="sm"
            />
            <span className="text-white font-medium">
                {team.name}
            </span>
        </div>
    </td>
    <td className="px-4 py-3">
        <SignatureProgress
            completed={team.signedCount}
            total={team.totalEmployees}
            variant="text"
            size="sm"
        />
    </td>
</tr>
```

---

## Design Consistency

Both components follow the app's dark mode theme:

- Background: `bg-neutral-950`, `bg-neutral-900`
- Cards/Elements: `bg-neutral-800`, `bg-neutral-700`
- Text: `text-white` (primary), `text-neutral-400` (secondary)
- Accents: `text-violet-400`, `bg-violet-600`
- Success: `bg-emerald-500/20`, `text-emerald-400`
- Transitions: `duration-150` for smooth interactions
