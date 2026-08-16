# Quick Reference Card - Users Management System

## Menu Navigation
```
Sidebar → Users
    ├── Users Tab (default)
    │   ├── Search: by username, email, name
    │   ├── Filter: by user role
    │   └── Actions: Edit, Delete
    │
    └── User Roles Tab
        ├── Create roles
        ├── Edit roles
        └── Deactivate roles
```

## Common Tasks

### Create a New User
1. Click "Add User" button
2. Upload photo (optional)
3. Fill required fields (*)
4. Set password or click "Generate Password"
5. Click "Create User"

### Edit a User
1. Click ✏️ icon in user row
2. Update fields as needed
3. Optional: Change password
4. Click "Update User"

### Deactivate a User
1. Click 🗑️ icon in user row
2. Confirm deactivation
3. User will be hidden from list

### Create a Role
1. Go to "User Roles" tab
2. Click "Add Role"
3. Enter role name & description
4. Click "Create Role"

## Form Fields

| Field | Type | Required | Example |
|-------|------|----------|---------|
| Username | text | Yes | john_doe_123 |
| Email | email | Yes | john@example.com |
| First Name | text | Yes | John |
| Last Name | text | No | Doe |
| Phone | tel | No | +1 (555) 123-4567 |
| Password | password | Yes* | MyPass123! |
| Address | text | No | 123 Main Street |
| City | text | No | New York |
| State | text | No | NY |
| Postal Code | text | No | 10001 |
| Country | text | No | USA |

*Required for new users, optional for editing

## Password Requirements

```
✓ At least 8 characters
✓ Uppercase letter (A-Z)
✓ Lowercase letter (a-z)
✓ Number (0-9)
✓ Special character (!@#$%^&*)
```

### Password Strength
- 🔴 Weak: 1-2 requirements
- 🟡 Fair: 3-4 requirements
- 🟢 Good: 5 requirements
- 🟢 Strong: All + 12+ chars

## Keyboard Shortcuts
| Action | Keys |
|--------|------|
| Focus search | Ctrl/Cmd + F |
| Open user form | Ctrl/Cmd + N |
| Close modal | Esc |
| Tab through fields | Tab |

## Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| Can't create user | Check all required fields (marked *) |
| Username error | Use unique username, no duplicates |
| Email error | Use unique email, no duplicates |
| Password weak | Add uppercase, numbers, special chars |
| Image not uploading | Use JPG/PNG format, <5MB |
| User not in list | Check if status is "Active" |
| Can't edit user | Refresh page and try again |
| Role not available | Create role first in "User Roles" tab |

## Data Storage Location

```
Database: IndexedDB (Browser Local Storage)
Tables:
  - user_roles (roles)
  - users (user accounts)
  - user_images (profile pictures)
```

## API Endpoints to Implement

```
POST   /api/users              → Create user
GET    /api/users              → List users
GET    /api/users/:id          → Get user
PUT    /api/users/:id          → Update user
DELETE /api/users/:id          → Delete user

POST   /api/roles              → Create role
GET    /api/roles              → List roles
PUT    /api/roles/:id          → Update role
DELETE /api/roles/:id          → Delete role

POST   /api/sync/users         → Sync to server
```

## File Locations

```
New Components:
  - src/pages/Users.svelte
  - src/pages/users/UsersIndex.svelte
  - src/pages/users/UserModal.svelte
  - src/pages/users/UserRoles.svelte

Utilities:
  - src/utils/passwordHelper.js

Updated:
  - src/db.js (user tables)
  - src/routes.js (/users)
  - src/layouts/DashboardLayout.svelte
  - src/components/Sidebar.svelte

Docs:
  - USERS_MANAGEMENT.md
  - USERS_SETUP_GUIDE.md
  - USERS_ARCHITECTURE.md
```

## Key Features

| Feature | Status |
|---------|--------|
| Create users | ✅ |
| Edit users | ✅ |
| Delete users (soft) | ✅ |
| Search users | ✅ |
| Filter by role | ✅ |
| Profile images | ✅ |
| Password hashing | ✅ |
| Password strength | ✅ |
| Role management | ✅ |
| Timestamps | ✅ |
| Form validation | ✅ |
| Mobile responsive | ✅ |
| Dark mode ready | ✅ |

## Database Relationships

```
user_roles (1) ──────────── (many) users
              (has many)

users (1) ──────────── (one) user_images
      (has one)
```

## Contact Information Fields

```
Primary: Email + Username (unique)
Secondary: Phone + Address
Tertiary: City, State, Postal Code, Country
```

## Status Values

```
1 = Active   (displayed in lists)
0 = Inactive (hidden from lists)
```

## Image Specifications

- Format: WebP (with fallback)
- Size: 400x400 pixels (square)
- Max file size: 5MB
- Supported input: JPG, PNG, WebP

## Password Hashing

Method: SHA-256 (client-side)
Output: 64-character hex string
Example: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

⚠️ Production: Use bcrypt on server

## Audit Trail Fields

All records include:
- `created_at` - ISO 8601 UTC timestamp
- `updated_at` - ISO 8601 UTC timestamp

Example: `2026-02-13T10:30:45.123Z`

## Browser Storage

- Storage Type: IndexedDB
- Max Size: Usually 50MB+
- Backup: Use browser export function
- Clear: DevTools → Application → Clear Storage

## Permissions & Access

Currently:
- No built-in role-based access control
- All users see all features

To implement RBAC:
1. Define permissions per role
2. Check role before rendering
3. Validate on server side

## Rate Limiting (Recommended)

- API calls: 100 per minute
- Login attempts: 5 per 15 minutes
- Password reset: 3 per hour
- User creation: 10 per hour

## Backup Strategy

1. Export users weekly
2. Store JSON backup
3. Test restore procedure
4. Keep 4-week rotation

```javascript
// Quick backup
const users = await db.users.toArray();
const backup = JSON.stringify(users, null, 2);
// Download backup file
```

## Mobile Considerations

✅ Responsive design
✅ Touch-friendly buttons
✅ Mobile-optimized modals
✅ Keyboard navigation
⚠️ Image upload may vary by device

## Performance Tips

1. Keep user images compressed
2. Limit search results display
3. Archive old user photos
4. Monitor IndexedDB size
5. Implement pagination

## Security Reminders

🔒 Never store passwords in plain text
🔒 Always use HTTPS in production
🔒 Implement server-side validation
🔒 Use secure password reset tokens
🔒 Log all admin actions

## Feature Roadmap

- [ ] Two-factor authentication
- [ ] Email verification
- [ ] Password reset via email
- [ ] User groups/departments
- [ ] Bulk import/export
- [ ] Role permissions matrix
- [ ] Activity logs
- [ ] Last login tracking

## Support Resources

- **USERS_MANAGEMENT.md** - Full technical docs
- **USERS_SETUP_GUIDE.md** - Getting started
- **USERS_ARCHITECTURE.md** - System design
- **Browser Console** - Error messages

## Version Info

```
System Version: 1.0
Created: February 13, 2026
Status: Production Ready
Last Updated: February 13, 2026
```

---

**Print this card for quick reference during implementation and daily use!**
