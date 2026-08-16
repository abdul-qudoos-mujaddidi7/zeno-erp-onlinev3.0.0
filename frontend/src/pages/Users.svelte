<script>
  import { onMount } from "svelte";
  import UsersIndex from "./users/UsersIndex.svelte";
  import UserRoles from "./users/UserRoles.svelte";
  
  import { t, lang, translate_org_type } from '../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  onMount(() => {
    document
      .querySelectorAll("[data-mdb-tab-init]")
      .forEach((el) => new window.mdb.Tab(el));
  });
</script>

<ul class="nav nav-tabs mb-3" role="tablist">
  <li class="nav-item" role="presentation">
    <button
      data-mdb-tab-init
      class="nav-link active"
      id="users-tab-1"
      data-mdb-target="#users-tabs-1"
      type="button"
      role="tab"
      aria-controls="users-tabs-1"
      aria-selected="true"
    >
      <i class="bi bi-people me-2"></i>{t('Users')}
    </button>
  </li>

  <li class="nav-item" role="presentation">
    <button
      data-mdb-tab-init
      class="nav-link"
      id="users-tab-2"
      data-mdb-target="#users-tabs-2"
      type="button"
      role="tab"
      aria-controls="users-tabs-2"
      aria-selected="false"
    >
      <i class="bi bi-shield-check me-2"></i>{t('User Roles')}
    </button>
  </li>
</ul>

<div class="tab-content">
  <div
    class="tab-pane fade show active"
    id="users-tabs-1"
    role="tabpanel"
    aria-labelledby="users-tab-1"
  >
    <UsersIndex />
  </div>

  <div
    class="tab-pane fade"
    id="users-tabs-2"
    role="tabpanel"
    aria-labelledby="users-tab-2"
  >
    <UserRoles />
  </div>
</div>
