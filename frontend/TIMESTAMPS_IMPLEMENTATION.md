# Timestamps Implementation Guide

## Overview
All database tables now have `created_at` and `updated_at` timestamps automatically managed by the application. These timestamps are essential for syncing with your online database.

## What Was Changed

### 1. Database Layer (`src/db.js`)
- **Added automatic timestamp management using Dexie hooks**
- `created_at`: Set automatically when a record is created (ISO 8601 format)
- `updated_at`: Set automatically when a record is created or updated (ISO 8601 format)
- No manual intervention needed in components - timestamps are handled automatically

### 2. Updated Tables with Timestamp Columns

All the following tables now display `created_at` and `updated_at` in their respective UI tables:

#### Core Tables:
- **Accounts** - `AccountsIndex.svelte`
- **Account Types** - `AccountTypes.svelte`
- **Currencies** - `Currencies.svelte`
- **Settings** - `MainSettings.svelte`

#### Product Management:
- **Products** - `ProductsIndex.svelte`
- **Product Categories** - `Categories.svelte`
- **Product Units** - `Units.svelte`
- **Warehouses** - `Warehouses.svelte`
- **Warehouse Products** (implicit via database hooks)

#### Transactions:
- **Purchases** - `Purchases.svelte`
- **Sales** - `Sales.svelte`
- **Purchase Items** (implicit via database hooks)
- **Sale Items** (implicit via database hooks)
- **Purchase Payments** (implicit via database hooks)
- **Sale Payments** (implicit via database hooks)
- **Journals** (implicit via database hooks)

## How It Works

### Automatic Timestamp Management
The database hooks in `db.js` automatically handle timestamps as follows:

```javascript
// When creating a record
db.table.add({...data})
// → created_at and updated_at are automatically set to current timestamp

// When updating a record
db.table.update(id, {...changes})
// → updated_at is automatically set to current timestamp
// → created_at remains unchanged
```

### Timestamp Format
Timestamps are stored in ISO 8601 format (UTC):
```
2026-02-13T10:30:45.123Z
```

### Displaying Timestamps
In the UI, timestamps are formatted using the browser's locale:
```svelte
{new Date(record.created_at).toLocaleString()}
// Output: "2/13/2026, 10:30:45 AM" (varies by locale)
```

## Using Timestamps for Online Database Sync

### Sync Strategy
Since timestamps are automatically managed, you can use them for efficient syncing:

```javascript
// 1. Export all records with timestamps
const records = await db.table.toArray();
// Each record will have: id, ...data, created_at, updated_at

// 2. For incremental sync, track the last sync time
const lastSyncTime = localStorage.getItem('lastSyncTime');
const changedRecords = await db.table
  .where('updated_at')
  .above(lastSyncTime)
  .toArray();

// 3. Send to your server for sync
const response = await fetch('https://api.example.com/sync', {
  method: 'POST',
  body: JSON.stringify(changedRecords),
  headers: { 'Content-Type': 'application/json' }
});

// 4. Update last sync time
localStorage.setItem('lastSyncTime', new Date().toISOString());
```

### Tables and Their Timestamps

#### Users & Administration
- `currencies` - Currency definitions
- `settings` - Application settings
- `account_types` - Account classification types
- `accounts` - Chart of accounts
- `account_images` - Account images/logos

#### Products
- `product_categories` - Product categories
- `product_units` - Units of measurement
- `products` - Product master records
- `product_images` - Product images
- `warehouses` - Warehouse locations
- `warehouse_products` - Inventory levels

#### Transactions
- `purchases` - Purchase orders
- `purchase_items` - Line items in purchases
- `purchase_payments` - Payment records for purchases
- `sales` - Sales invoices
- `sale_items` - Line items in sales
- `sale_payments` - Payment records for sales
- `journals` - Journal entries

## Implementation Details

### Dexie Hooks Used
Two hooks are implemented for each table:

1. **Creating Hook** - Fires when a new record is inserted
   ```javascript
   table.hook('creating', (primKey, obj) => {
     obj.created_at = obj.created_at || getCurrentTimestamp();
     obj.updated_at = obj.updated_at || getCurrentTimestamp();
   });
   ```

2. **Updating Hook** - Fires when an existing record is modified
   ```javascript
   table.hook('updating', (modifications, primKey, obj) => {
     modifications.updated_at = getCurrentTimestamp();
   });
   ```

### Timestamp Utility Function
A helper function is available in `db.js`:
```javascript
import { getCurrentTimestamp } from './db.js';

// Returns current ISO timestamp
const now = getCurrentTimestamp();
// "2026-02-13T10:30:45.123Z"
```

## Key Benefits

✅ **Automatic Management** - No manual timestamp code needed
✅ **Consistent Format** - ISO 8601 UTC timestamps across all tables
✅ **Zero Configuration** - Works automatically on all CRUD operations
✅ **Sync Ready** - Perfect for incremental database synchronization
✅ **Audit Trail** - Tracks creation and last modification times
✅ **Offline Ready** - Works seamlessly with local-first architecture

## Testing Your Timestamps

1. **Create a new record** - Check that `created_at` and `updated_at` are set
2. **Edit the record** - Verify that `updated_at` changes while `created_at` stays the same
3. **Check the UI** - Review the timestamp columns in each table view
4. **Export data** - Use browser DevTools to inspect records in IndexedDB

### Quick Test
```javascript
// In browser console
const records = await db.accounts.toArray();
console.log(records[0]);
// Should show created_at and updated_at fields
```

## Migration Note

All existing records created before this update will have timestamp fields added automatically:
- **created_at** - Set to current time when first records are saved
- **updated_at** - Set to current time when first records are saved

For production, consider a data migration script to set accurate timestamps for historical records.

## Future Enhancements

Consider adding:
- `deleted_at` field for soft deletes
- `synced_at` field to track when records were synced to server
- User tracking: `created_by`, `updated_by` fields
- Change logs or audit tables

## Support

If you encounter any issues:
1. Check that `db.js` has the timestamp hooks properly configured
2. Verify timestamps are appearing in browser DevTools
3. Check localStorage for sync tracking data
4. Ensure UTC timestamps are being sent to your online database

---

**Implementation Date:** February 13, 2026
**Components Updated:** 9 major components
**Tables Enhanced:** 18 tables with automatic timestamp management
