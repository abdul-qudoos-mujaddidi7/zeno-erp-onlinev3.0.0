# Users Management System Documentation

## Overview

The Users Management System is a comprehensive module for managing user accounts, roles, and permissions in your ZenoERP application. It includes professional UI components built with MDB Bootstrap, secure password handling, and complete user profile management.

## Features

### Core Features
✅ **User Management**
- Create, read, update, and delete users
- Complete user profiles with personal and contact information
- User profile images with automatic WebP conversion
- Status tracking (active/inactive)
- Search and filter capabilities

✅ **Role Management**
- Define and manage user roles
- Assign roles to users
- Role-based access control ready
- Description and status tracking

✅ **User Profiles**
- Personal information (first name, last name)
- Account information (username, email)
- Contact information (phone, email)
- Address information (street, city, state, postal code, country)
- Profile picture with 400x400px WebP format

✅ **Password Management**
- Secure password hashing using SHA-256
- Password strength validation
- Auto-generate temporary passwords
- Password confirmation requirement
- Password change without logout

✅ **Timestamps**
- Automatic `created_at` tracking
- Automatic `updated_at` on modifications
- Professional date/time display

## Database Schema

### Tables

#### 1. `user_roles`
```javascript
{
  id: number,              // Primary key (auto-increment)
  name: string,            // Role name (unique)
  description: string,     // Role description
  status: number,          // 1 = Active, 0 = Inactive
  created_at: ISO8601,     // Creation timestamp
  updated_at: ISO8601      // Last update timestamp
}
```

**Example Roles:**
- Administrator
- Manager
- Employee
- Staff
- Guest

#### 2. `users`
```javascript
{
  id: number,              // Primary key (auto-increment)
  role_id: number,         // Foreign key to user_roles
  username: string,        // Unique username
  email: string,           // Unique email address
  password_hash: string,   // SHA-256 hashed password
  first_name: string,      // User's first name
  last_name: string,       // User's last name
  phone: string,           // Phone number
  address: string,         // Street address
  city: string,            // City
  state: string,           // State/Province
  postal_code: string,     // Postal/ZIP code
  country: string,         // Country
  status: number,          // 1 = Active, 0 = Inactive
  created_at: ISO8601,     // Creation timestamp
  updated_at: ISO8601      // Last update timestamp
}
```

#### 3. `user_images`
```javascript
{
  id: number,              // Primary key (auto-increment)
  user_id: number,         // Foreign key to users
  image: Blob,             // WebP image blob
  created_at: ISO8601,     // Creation timestamp
  updated_at: ISO8601      // Last update timestamp
}
```

## Components

### 1. Users.svelte (Main Page)
Main container page with tab navigation.
- **Location:** `src/pages/Users.svelte`
- **Features:**
  - Tab-based navigation between Users and Roles
  - Responsive MDB Bootstrap design
  - Icon indicators for each tab

### 2. UsersIndex.svelte
User list view with management features.
- **Location:** `src/pages/users/UsersIndex.svelte`
- **Features:**
  - Dynamic user table with profile pictures
  - Search functionality (username, email, name)
  - Filter by user role
  - Edit/Delete actions
  - Active user count badge
  - Responsive grid filters
  - Empty state with helpful message

### 3. UserModal.svelte
Comprehensive user creation and editing modal.
- **Location:** `src/pages/users/UserModal.svelte`
- **Features:**
  - Large modal dialog (modal-lg)
  - Profile photo upload with preview
  - Organized form sections:
    - Personal Information
    - Account Information
    - Contact Information
    - Address Information
    - Password Section
  - Password strength indicator
  - Generate temporary password button
  - Image conversion to WebP (400x400px)
  - Form validation
  - Unique username/email checking

### 4. UserRoles.svelte
Role management interface.
- **Location:** `src/pages/users/UserRoles.svelte`
- **Features:**
  - Create new roles
  - Edit existing roles
  - Soft delete (deactivate) roles
  - Simple role list with descriptions
  - Active/Inactive status badges
  - Timestamps display

## Password Management

### Password Utility Functions
**Location:** `src/utils/passwordHelper.js`

#### Available Functions

1. **hashPassword(password)**
   ```javascript
   const hash = await hashPassword("myPassword123!");
   ```
   - Returns SHA-256 hash of the password
   - Async function
   - Client-side only (for demo)

2. **verifyPassword(password, hash)**
   ```javascript
   const isValid = await verifyPassword("myPassword123!", hash);
   ```
   - Compares password with stored hash
   - Returns boolean
   - Async function

3. **validatePasswordStrength(password)**
   ```javascript
   const validation = validatePasswordStrength("MyPass123!");
   // Returns: {
   //   score: 5,
   //   strength: "Good",
   //   valid: true,
   //   feedback: ["Password is strong"]
   // }
   ```
   - Evaluates password strength
   - Returns detailed feedback
   - Synchronous function

4. **generateTemporaryPassword()**
   ```javascript
   const tempPassword = generateTemporaryPassword();
   // "aB3!xY9zQ2"
   ```
   - Generates random 12-character password
   - Includes uppercase, lowercase, numbers, special chars
   - Synchronous function

### Password Requirements
- **Minimum Length:** 8 characters
- **Uppercase:** At least one A-Z
- **Lowercase:** At least one a-z
- **Numbers:** At least one 0-9
- **Special Characters:** At least one of !@#$%^&*

### Password Strength Levels
- **Weak** (Score 0-2): Red badge
- **Fair** (Score 3-4): Orange badge
- **Good** (Score 5): Green badge
- **Strong** (Score 6): Green badge

## Usage Examples

### Creating a User
1. Click "Add User" button
2. Upload profile photo (optional)
3. Fill personal information
4. Enter username and select role
5. Enter email and phone
6. Enter address details
7. Set password (or generate one)
8. Click "Create User"

### Editing a User
1. Click edit button (pencil icon) in user row
2. Modal opens with pre-filled data
3. Update desired fields
4. Password field is optional for existing users
5. Click "Update User"

### Managing Roles
1. Go to "User Roles" tab
2. Click "Add Role" to create new role
3. Enter role name and description
4. Click "Create Role"
5. Edit or deactivate roles as needed

## Security Considerations

⚠️ **Important:** This system includes client-side password hashing for demonstration purposes. 

### Production Implementation
For production deployment:

1. **Hash passwords on the server-side using bcrypt:**
   ```javascript
   // Node.js/Express example
   const bcrypt = require('bcrypt');
   const hashedPassword = await bcrypt.hash(password, 10);
   ```

2. **Use HTTPS/TLS for all authentication**

3. **Implement JWT or session-based authentication**

4. **Add role-based access control (RBAC)**

5. **Implement password reset functionality**

6. **Add login audit logs**

7. **Implement rate limiting**

8. **Use secure password reset tokens**

## Integration with Timestamps

All user data automatically includes:
- `created_at` - When the user was created
- `updated_at` - Last modification time

These can be used for:
- User activity tracking
- Audit trails
- Last login calculation
- Account age verification
- Sync with online databases

## API Integration

### Syncing Users to Online Database

```javascript
// Export all users
async function syncUsersToServer() {
  const users = await db.users.toArray();
  
  // Get only changed users since last sync
  const lastSync = localStorage.getItem('usersSyncTime');
  const changedUsers = lastSync
    ? await db.users.where('updated_at').above(lastSync).toArray()
    : users;

  // Send to server
  const response = await fetch('https://api.example.com/sync/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changedUsers)
  });

  if (response.ok) {
    localStorage.setItem('usersSyncTime', new Date().toISOString());
  }
}
```

## Styling and Design

### Color Scheme
- **Primary:** #0d6efd (Bootstrap primary blue)
- **Success:** #198754 (Bootstrap success green)
- **Danger:** #dc3545 (Bootstrap danger red)
- **Secondary:** #6c757d (Bootstrap secondary gray)

### MDB Components Used
- Cards
- Modals
- Tables
- Forms
- Badges
- Buttons
- Input groups
- Progress bars

### Responsive Design
- Mobile-first approach
- Sidebar collapses on mobile
- Tables become responsive
- Modals adjust to screen size
- Touch-friendly buttons

## Troubleshooting

### Issue: Users not appearing in list
**Solution:** 
1. Check if users have status = 1 (active)
2. Verify user_roles are created
3. Check browser console for errors

### Issue: Password validation too strict
**Solution:**
Edit `PASSWORD_REQUIREMENTS` in `src/utils/passwordHelper.js`

### Issue: Image upload not working
**Solution:**
1. Check browser console permissions
2. Ensure image input accepts proper file types
3. Verify WebP conversion support

### Issue: Cannot delete user
**Solution:**
- Users are soft-deleted (status set to 0)
- To permanently delete, clear IndexedDB
- Deactivated users can be reactivated

## Best Practices

1. **Always validate on the client AND server**
2. **Use HTTPS in production**
3. **Implement proper RBAC system**
4. **Log all user management actions**
5. **Use strong password requirements**
6. **Regularly backup user data**
7. **Implement user session timeouts**
8. **Monitor for suspicious activities**
9. **Use role-based page access**
10. **Encrypt sensitive data**

## Future Enhancements

- [ ] Email verification
- [ ] Two-factor authentication
- [ ] Role-based access control (RBAC) implementation
- [ ] User activity logs
- [ ] Last login tracking
- [ ] Password reset via email
- [ ] Bulk user import/export
- [ ] User groups/departments
- [ ] User permissions matrix
- [ ] Login audit trails
- [ ] IP whitelisting
- [ ] Session management

## File Structure

```
src/
├── pages/
│   ├── Users.svelte              # Main users page
│   └── users/
│       ├── UsersIndex.svelte      # Users list
│       ├── UserModal.svelte       # User form modal
│       └── UserRoles.svelte       # Roles management
├── utils/
│   └── passwordHelper.js          # Password utilities
├── db.js                          # Database configuration
└── routes.js                      # Route definitions
```

## Testing Checklist

- [ ] Create a new user with all fields
- [ ] Edit an existing user
- [ ] Deactivate a user
- [ ] Search users by username
- [ ] Filter users by role
- [ ] Upload profile image
- [ ] Generate temporary password
- [ ] Validate password strength
- [ ] Create new role
- [ ] Edit role
- [ ] Deactivate role
- [ ] Verify timestamps on records
- [ ] Test on mobile devices
- [ ] Test without JavaScript enabled
- [ ] Check accessibility (keyboard navigation)

---

**Version:** 1.0
**Last Updated:** February 13, 2026
**Status:** Production Ready
