# Programs Sidebar Plan — Live / Upcoming / Completed

## Objective
Replace the Programs sidebar's static `All | Favourites | Cricket | Football` tabs with a data-driven **Live | Upcoming | Completed** view bound to the existing `programsByDistance` API.

## Current State
- **Sidebar location**: `home.component.html:492-589`
- **Existing API**: `HomeService.getProgramsByDistanceKm()` (`home.service.ts:221`) already supports `status?: 'LIVE' | 'UPCOMING' | 'COMPLETED'`
- **Data model**: `ProgramItem` and `ProgramListRequestBackend` already defined in `home.models.ts:76-102`
- **Gap**: No fetch logic, no signals, no cards — sidebar shows only empty-state placeholders

## Proposed Changes

### 1. State in `home.component.ts`
Add:
- `programsList = signal<ProgramItem[]>([])`
- `isProgramsLoading = signal<boolean>(false)`
- `programsError = signal<string | null>(null)`
- `programYear = signal<number>(currentYear)`
- `programTabIndex = signal<number>(0)`

Add computed:
- `livePrograms`, `upcomingPrograms`, `completedPrograms` — filter by status, then sort by `compareByScheduleAndStatus()` then by `startDate`, `endDate`, `programName`

### 2. New Component: `program-sidebar-card`
Create standalone component:
- `program-sidebar-card.component.ts/html/scss`
- Inputs: `program: ProgramItem`, `distanceFromUser: string`
- Display: compact logo + name + committee + date range + status badge + distance
- Click: navigate to `/dashboard/program/{{ program.id }}`

### 3. Fetch Logic in `home.component.ts`
Add `loadProgramsByStatus(status?: 'LIVE' | 'UPCOMING' | 'COMPLETED')`:
```typescript
const body: ProgramListRequestBackend = {
  latitude: coords.lat,
  longitude: coords.long,
  distanceKm: this.selectedProgramRadius,
  year: this.programYear(),
  status
};
this.homeService.getProgramsByDistanceKm(body).subscribe({...});
```

Trigger on:
- `programTabIndex` change → fetch corresponding status
- `selectedProgramRadius` change → re-fetch current tab
- `programYear` change → re-fetch current tab
- `userLocationCords` change → re-fetch current tab
- `programSearchQuery` change → client-side filter existing list

### 4. Template Changes in `home.component.html`
Replace sidebar tabs:
```html
<mat-tab-group class="sidebar-tabs" [(selectedIndex)]="programTabIndex" (selectedIndexChange)="onProgramTabChange($event)">
  <mat-tab>
    <ng-template mat-tab-label>
      <mat-icon>play_circle</mat-icon>
      <span>Live</span>
      <span class="tab-badge">{{ livePrograms().length }}</span>
    </ng-template>
    <!-- program list or skeleton/empty -->
  </mat-tab>
  <mat-tab>...</mat-tab> <!-- Upcoming -->
  <mat-tab>...</mat-tab> <!-- Completed -->
</mat-tab-group>
```

Add year dropdown in sidebar header (after radius select):
```html
<mat-icon>calendar_today</mat-icon>
<select [(ngModel)]="programYear" (ngModelChange)="onProgramYearChange($event)">
  <!-- options from establishYear to currentYear -->
</select>
```

### 5. Styling in `home.component.scss`
Add:
- `.program-sidebar-card` — compact card, full sidebar width
- `.program-sidebar-card-logo` — 32px avatar
- `.program-sidebar-card-body` — name, committee, date
- `.program-status-badge` — color-coded: Live=green, Upcoming=blue, Completed=gray
- `.sidebar-tabs .tab-badge` — match existing badge style

## New Files
| File | Purpose |
|------|---------|
| `program-sidebar-card.component.ts` | Standalone program card component |
| `program-sidebar-card.component.html` | Card template |
| `program-sidebar-card.component.scss` | Card styles |

## Modified Files
| File | Changes |
|------|---------|
| `home.component.ts` | Add program state, fetch logic, computed filters, tab/year handlers |
| `home.component.html` | Replace sidebar tabs, add year dropdown, bind program cards |
| `home.component.scss` | Add program card + badge styles |

## Notes
- Existing `getProgramsByDistanceKm` already handles `status` param — no backend changes needed
- Sorting utility `compareByScheduleAndStatus` exists at `program-schedule-sort.util.ts`
- Year range can mirror groups panel: from min committee `establishYear` to `currentYear`, or a simple range like 2020-2026
