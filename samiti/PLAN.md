# Plan: Replace Settings Icon with User Photo and Account Dialog

## Implementation Status: ✅ COMPLETED
    
### Completed Steps:

1. ✅ Created Account Dialog Component at `src/app/components/dialog/account/`:
   - `account.component.ts` - Main component with edit profile functionality
   - `account.component.html` - Template with user photo, info display, and edit form
   - `account.component.scss` - Styles for the account dialog
   - `account.models.ts` - TypeScript interfaces
   - `account.service.ts` - API service for account operations

2. ✅ Updated Environment - Added `account` endpoint in `environment.ts`

3. ✅ Modified Header Component:
   - Replaced settings icon with user avatar button
   - Added `userPhoto` and `userInitials` signals
   - Added `openAccountDialog()`, `loadUserData()` methods
   - Updated logout to clear user data

4. ✅ Updated Login Component - Added `name` storage in localStorage

5. ✅ Added User Avatar styles in header.component.scss

## Files Modified:
- `src/app/components/header/header.component.html` - Replaced settings icon with user avatar
- `src/app/components/header/header.component.ts` - Added account dialog functionality
- `src/app/components/header/header.component.scss` - Added user avatar styles
- `src/environments/environment.ts` - Added account endpoints
- `src/app/components/dialog/login/login.component.ts` - Added name to localStorage

## New Files Created:
- `src/app/components/dialog/account/account.component.ts`
- `src/app/components/dialog/account/account.component.html`
- `src/app/components/dialog/account/account.component.scss`
- `src/app/components/dialog/account/account.models.ts`
- `src/app/components/dialog/account/account.service.ts`
