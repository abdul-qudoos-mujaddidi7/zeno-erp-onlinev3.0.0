# User Management System - Setup & Getting Started Guide

## Quick Start

### Step 1: Initialize Default Roles
When you first access the Users Management section, add these default roles:

1. **Administrator**
   - Full system access
   - Can manage all users and settings

2. **Manager**
   - Can view and manage reports
   - Can approve transactions
   - Limited user management

3. **Employee**
   - Can create and view own records
   - Can submit transactions for approval

4. **Staff**
   - Basic access to system
   - Can only view assigned data

5. **Guest**
   - Read-only access
   - View reports only

### Step 2: Create Your First User

1. Navigate to Users section in sidebar
2. Click "Add User" button
3. Fill in the following required fields:
   - First Name
   - Username (must be unique)
   - Email (must be unique)
   - Select a Role
   - Set a Password
4. Optionally add:
   - Last Name
   - Phone Number
   - Complete Address Information
   - Profile Photo
5. Click "Create User"

### Step 3: Managing Users

#### To Edit a User
- Click the pencil icon in the user's row
- Update any information
- To change password, fill the password fields
- Empty password fields mean no change (for existing users)
- Click "Update User"

#### To Deactivate a User
- Click the trash icon in the user's row
- Confirm the deactivation
- User status changes to Inactive
- Can be reactivated by editing and changing status

## Database Integration

After setting up users in the local database, sync them to your online database:

```javascript
// Example: Sync users to online database
async function syncUsersToCloud() {
  const users = await db.users.toArray();
  const roles = await db.user_roles.toArray();
  
  // Send to backend
  const response = await fetch('https://your-api.com/sync/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users, roles })
  });

  if (response.ok) {
    console.log('Users synced successfully');
  }
}
```

## User Fields Reference

### Personal Information Section
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| First Name | text | Yes | User's first name |
| Last Name | text | No | User's surname |

### Account Information Section
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Username | text | Yes | Unique identifier, 3-50 chars |
| User Role | select | Yes | Must be existing active role |

### Contact Information Section
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Email | email | Yes | Unique email address |
| Phone | tel | No | International format supported |

### Address Information Section
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Street Address | text | No | Full street address |
| City | text | No | City/Town name |
| State/Province | text | No | State or province |
| Postal Code | text | No | ZIP/Postal code |
| Country | text | No | Country name |

### Password Section
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Password | password | Yes (new) | Min 8 chars, mixed case + numbers |
| Confirm Password | password | Yes (new) | Must match password |

### Additional Fields
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Status | select | 1 | 1=Active, 0=Inactive |
| Profile Photo | image | None | WebP, 400x400px |

## Password Policy

Your system enforces the following password policy:

```
✓ Minimum 8 characters
✓ At least one uppercase letter (A-Z)
✓ At least one lowercase letter (a-z)
✓ At least one number (0-9)
✓ At least one special character (!@#$%^&*)
```

### Password Strength Scoring
- **Weak:** Only 1-2 requirements met
- **Fair:** 3-4 requirements met
- **Good:** 5 requirements met
- **Strong:** All requirements met + 12+ characters

### Example Passwords

❌ **Weak Passwords:**
- `password` - No numbers or capitals
- `Pass1234` - No special characters
- `abc123!` - Less than 8 characters

✅ **Strong Passwords:**
- `MySecure123!Pass`
- `Admin@2024System`
- `Zeno!ERP#2024Beta`

## Features in Detail

### 1. Search Functionality
- Search by username: `admin`
- Search by email: `admin@example.com`
- Search by name: `John` or `Doe`
- Real-time filtering

### 2. Role Filtering
- Filter users by assigned role
- "All Roles" shows everyone
- Quick role-based access control

### 3. User Count Badge
- Shows number of active users matching filters
- Updates in real-time
- Useful for tracking team size

### 4. Profile Images
- Upload JPG, PNG, or WebP images
- Automatically converted to WebP
- Square format (400x400px)
- Displayed in user list and modal

### 5. Timestamps
- **Created At:** When user account was created
- **Updated At:** Last time account was modified
- Both use browser's locale for display
- Useful for audit trails

## API Endpoints Example

Example API endpoints you might implement on your server:

```javascript
// GET /api/users
// Returns: Array of all users with roles

// POST /api/users
// Body: { username, email, first_name, ... }
// Returns: Created user

// PUT /api/users/:id
// Body: Updated user fields
// Returns: Updated user

// DELETE /api/users/:id
// Returns: { success: true }

// GET /api/roles
// Returns: Array of all roles

// POST /api/roles
// Body: { name, description }
// Returns: Created role
```

## Troubleshooting Common Issues

### "Username already exists"
**Cause:** Username is taken by another user
**Solution:** Choose a unique username

### "Email already exists"
**Cause:** Email is already registered
**Solution:** Use a different email or check if user exists

### Password validation fails
**Cause:** Password doesn't meet requirements
**Solution:** Follow the password strength indicator

### Image upload fails
**Cause:** File type not supported
**Solution:** Use JPG, PNG, or WebP format

### User not appearing in list
**Cause:** User status is 0 (inactive)
**Solution:** Edit user and set Status to Active

### Can't edit a field
**Cause:** System error or permission issue
**Solution:** Refresh page and try again

## Admin Guidelines

### Best Practices for User Management

1. **Regular Audits**
   - Review inactive users monthly
   - Check for unused accounts
   - Verify role assignments

2. **Password Security**
   - Require password changes quarterly
   - Monitor failed login attempts
   - Disable accounts after inactivity

3. **Role Assignment**
   - Follow principle of least privilege
   - Document role requirements
   - Review permissions regularly

4. **Data Protection**
   - Regularly backup user data
   - Ensure HTTPS in production
   - Encrypt sensitive information

5. **Compliance**
   - Keep audit logs of all changes
   - Document access controls
   - Implement data retention policies

## Advanced Configuration

### Customizing Password Requirements

Edit `src/utils/passwordHelper.js`:

```javascript
// Change minimum length
if (password.length >= 12) {  // Changed from 8
  score += 1;
}

// Add additional requirements
if (/[àáäâèéëêìíïî]/.test(password)) {  // Accented characters
  score += 1;
}
```

### Adding Custom User Fields

1. Update `db.js` - Add fields to user schema
2. Update `UserModal.svelte` - Add form fields
3. Update `UsersIndex.svelte` - Display in table
4. Test form validation

### Implementing Role Permissions

```javascript
// Example permission system
const rolePermissions = {
  admin: ['users.create', 'users.edit', 'users.delete'],
  manager: ['users.view', 'users.edit'],
  employee: ['users.view']
};

function hasPermission(role, permission) {
  return rolePermissions[role]?.includes(permission) ?? false;
}
```

## Performance Tips

1. **Search Optimization:**
   - Add indexes on username and email in db.js
   - Limit displayed results in large datasets

2. **Image Optimization:**
   - Compress images before upload
   - Use WebP format for smaller files
   - Set height/width on img tags

3. **Pagination:**
   - Consider implementing for large user lists
   - Load users in chunks

4. **Caching:**
   - Cache user roles list
   - Invalidate on role changes

## Testing Your Setup

### Manual Testing Checklist
- [ ] Create test user with all fields
- [ ] Create test user with minimal fields
- [ ] Edit test user
- [ ] Deactivate and reactivate user
- [ ] Upload different image formats
- [ ] Test all search combinations
- [ ] Test role filtering
- [ ] Verify password strength indicators
- [ ] Test on mobile device
- [ ] Check timestamps update correctly

### Test User Account
```
Username: testuser
Email: test@example.com
Password: TestPass123!
First Name: Test
Last Name: User
Role: Employee
```

## Exporting User Data

### Export as JSON
```javascript
async function exportUsers() {
  const users = await db.users.toArray();
  const roles = await db.user_roles.toArray();
  
  const data = { users, roles };
  const json = JSON.stringify(data, null, 2);
  
  // Download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-export-${Date.now()}.json`;
  a.click();
}
```

### Export as CSV
```javascript
async function exportUsersCSV() {
  const users = await db.users.toArray();
  
  const csv = [
    ['ID', 'Username', 'Email', 'First Name', 'Last Name', 'Role', 'Status'],
    ...users.map(u => [u.id, u.username, u.email, u.first_name, u.last_name, u.role_id, u.status])
  ]
  .map(row => row.map(cell => `"${cell || ''}"`).join(','))
  .join('\n');
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-export-${Date.now()}.csv`;
  a.click();
}
```

## Support & Resources

- **Documentation:** See USERS_MANAGEMENT.md
- **Issues:** Check browser console for error messages
- **Password Help:** See password validation feedback in the form
- **Image Issues:** Ensure file is valid image format

---

**Ready to go!** Start using the Users Management System. Your system is now prepared for professional user account management.

Created: February 13, 2026
