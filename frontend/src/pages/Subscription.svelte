<script>
  import { onMount } from 'svelte';

  import { t, lang, translate_org_type } from '../i18n/i18n.js';
  import PanelSkeleton from '../components/common/PanelSkeleton.svelte';
import { currencyApi } from '../api/currencyApi.js';
import { warehouseApi } from '../api/warehouseApi.js';
  $: _lang = $lang;
import { accountApi } from '../api/accountApi.js';
import { userApi } from '../api/userApi.js';
import { productApi } from '../api/productApi.js';
import { journalApi } from '../api/journalApi.js';
import { saleApi } from '../api/saleApi.js';
  $: _translate_org_type = $translate_org_type;

  let subscription = null;

  let dataUsage = {};

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let fromDate = '';
  let toDate = '';

  onMount(async () => {
    subscription = JSON.parse(localStorage.getItem('subscription'));

    dataUsage['Product'] = (await productApi.getAll({ status: 1 }))?.data || [];
    dataUsage['Account'] = await (await accountApi.getAll({ status: 1 }))?.data || [];
    dataUsage['User'] = await (await userApi.getAll({ status: 1 }))?.data || [];
    dataUsage['Currency'] = (await currencyApi.getAll({ status: 1 }))?.data || [];
    dataUsage['Treasury'] = await (await accountApi.getAll({ status: 1, code: 'TREASURY' }))?.data || [];
    dataUsage['Shareholder Account'] = await (await accountApi.getAll({ status: 1, account_type_id: 7 }))?.data || [];
    dataUsage['Warehouse'] = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    /*
     * The usage bars only read `.length`, so ask the API for the count
     * (page size 1 + meta.total) instead of downloading every journal
     * and sale row just to measure them.
     */
    const journalUsage = await journalApi.getAll({ status: 1, page: 1, limit: 1 });
    dataUsage['Journal'] = { length: Number(journalUsage?.meta?.total) || 0 };

    const salesUsage = await saleApi.getAll({
      status: 1,
      page: 1,
      limit: 1,
      date_from: fromDate || undefined,
      date_to: toDate || undefined,
    });
    dataUsage['Daily Sales'] = { length: Number(salesUsage?.meta?.total) || 0 };
  });

  function formatDate(date) {
    return new Date(date).toLocaleDateString();
  }

  function daysRemaining(date) {
    const diff = new Date(date) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  $: countFeatures = subscription?.features?.filter((f) => f.type === 'count') || [];

  $: boolFeatures = subscription?.features?.filter((f) => f.type === 'boolean') || [];
</script>

{#if subscription}
  <div class="subscription-page">
    <!-- Hero Card -->
    <div class="card subscription-hero mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h2 class="fw-bold mb-1">{t('Subscription Overview')}</h2>

            <p class="text-muted mb-0">
              {t('Organization')} z{subscription.org_id}
            </p>
          </div>

          <div class="text-end">
            <span
              class="badge rounded-pill bg-{subscription.subscription_status == 'active'
                ? 'success'
                : subscription.subscription_status == 'trial'
                  ? 'warning'
                  : 'danger'} fs-6">
              {t(subscription.subscription_status).toUpperCase()}
            </span>

            <div class="small text-muted mt-2">
              {#if subscription.subscription_status == 'active'}
                {daysRemaining(subscription.end_date)}
              {:else}
                {daysRemaining(subscription.trial_end_date)}
              {/if}

              {t('days remaining')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Statistics -->
    <div class="row g-2 mb-3 subscription-stats">
      {#each countFeatures.slice(0, 4) as feature}
        <div class="col-md-3">
          <div class="card subscription-stat-card h-100">
            <div class="card-body">
              <i class="{feature.icon} fs-1 text-primary"></i>
              <div class="subscription-stat-copy">
                <h3 class="fw-bold" dir="ltr">
                  {feature.value}
                  {feature.unit}
                </h3>
                <div class="text-muted">
                  {t(feature.name)}
                </div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Details + Limits -->
    <div class="row g-3">
      <div class="col-lg-4">
        <div class="card subscription-panel h-100">
          <div class="card-header bg-light">{t('Subscription Details')}</div>

          <div class="card-body">
            <table class="table table-sm">
              <tbody>
                <tr>
                  <td>{t('Subscription Plan')}</td>
                  <td
                    ><strong
                      >{_lang == 'en'
                        ? subscription.subscription_plan.name
                        : subscription.subscription_plan.name_fa}</strong
                    ></td>
                </tr>
                <tr>
                  <td>{t('Start Date')}</td>
                  <td>{formatDate(subscription.start_date)}</td>
                </tr>

                <tr>
                  <td>{t('End Date')}</td>
                  <td>{formatDate(subscription.end_date)}</td>
                </tr>

                <tr>
                  <td>{t('Trial Ends')}</td>
                  <td>{formatDate(subscription.trial_end_date)}</td>
                </tr>

                <tr>
                  <td>{t('Next Billing')}</td>
                  <td>{formatDate(subscription.next_billing_date)}</td>
                </tr>

                <tr>
                  <td>{t('Status')}</td>
                  <td>
                    <span
                      class="badge badge-{subscription.subscription_status == 'active'
                        ? 'success'
                        : subscription.subscription_status == 'trial'
                          ? 'warning'
                          : 'danger'}">
                      {t(subscription.subscription_status)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-lg-8">
        <div class="card subscription-panel">
          <div class="card-header bg-light">Resource Limits</div>

          <div class="card-body">
            {#each countFeatures as feature}
              <div class="subscription-limit-row">
                <div class="d-flex justify-content-between">
                  <span>
                    <i class="{feature.icon} me-2"></i>
                    {t(feature.name)}
                  </span>

                  <strong dir="ltr">
                    {dataUsage[feature.name]?.length ?? 0} /
                    {feature.value}
                    {feature.unit}
                  </strong>
                </div>

                <div class="progress mt-1" style="height:10px">
                  <div
                    class="progress-bar"
                    style="width:{((dataUsage[feature.name]?.length ?? 0) / feature.value) * 100}%">
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- Features -->
    <div class="card subscription-panel mt-3">
      <div class="card-header bg-light">{t('Included Features')}</div>

      <div class="card-body">
        <div class="row">
          {#each boolFeatures as feature}
            <div class="col-md-4 mb-2">
              <div class="subscription-feature h-100">
                <div class="d-flex align-items-center">
                  <i
                    class="{feature.value === 'true'
                      ? 'bi bi-check-circle-fill text-success'
                      : 'bi bi-x-circle-fill text-danger'} fs-4 me-2">
                  </i>

                  <div>
                    <div class="fw-semibold">
                      {t(feature.name)}
                    </div>

                    {#if feature.unit}
                      <small class="text-muted">
                        {feature.unit}
                      </small>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="subscription-loading"><PanelSkeleton ariaLabel={t('Loading...')} lines={4} lineHeight="24px" /></div>
{/if}

<style>
  .subscription-page { width: 100%; padding: 0; }
  .subscription-hero { overflow: hidden; border: 0; border-radius: 12px; background: linear-gradient(135deg,#f8fbff 0%,#eef5ff 100%); box-shadow: 0 3px 12px rgba(30,48,76,.07); }
  .subscription-hero :global(.card-body) { padding: 14px 18px; }
  .subscription-hero h2 { color: #1f2a3d; font-size: 1.05rem; font-weight: 850 !important; }
  .subscription-hero :global(.badge) { padding: 6px 10px; border-radius: 999px; font-size: .68rem !important; font-weight: 850; letter-spacing: .03em; }
  .subscription-stat-card { border: 0; border-radius: 11px; background: #fff; box-shadow: 0 3px 12px rgba(30,48,76,.065); transition: transform .18s ease, box-shadow .18s ease; }
  .subscription-stat-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(30,48,76,.09); }
  .subscription-stat-card :global(.card-body) { display: flex; min-height: 72px; align-items: center; gap: 11px; padding: 11px 13px; }
  .subscription-stat-card i { display: inline-grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 9px; background: #eaf2ff; font-size: 1.05rem !important; }
  .subscription-stat-copy { min-width: 0; }
  .subscription-stat-card h3 { margin: 0 0 2px !important; color: #263244; font-size: 1rem; line-height: 1.15; }
  .subscription-stat-card .text-muted { font-size: .76rem; font-weight: 750; }
  .subscription-panel { overflow: hidden; border: 0; border-radius: 11px; background: #fff; box-shadow: 0 3px 12px rgba(30,48,76,.065); }
  .subscription-panel :global(.card-header) { padding: 10px 14px; border-bottom: 1px solid #edf1f6; background: #fff !important; color: #344155; font-size: .8rem; font-weight: 850; }
  .subscription-panel :global(.card-body) { padding: 12px 14px; }
  .subscription-panel :global(.table) { margin-bottom: 0; }
  .subscription-panel :global(.table td) { padding: 7px 6px; border-color: #edf1f6; color: #526176; font-size: .75rem; }
  .subscription-limit-row { margin-bottom: 9px; font-size: .76rem; }
  .subscription-limit-row:last-child { margin-bottom: 0; }
  .subscription-panel :global(.progress) { height: 6px !important; overflow: hidden; border-radius: 999px; background: #e9eef5; }
  .subscription-panel :global(.progress-bar) { border-radius: 999px; background: linear-gradient(90deg,#2f6fed,#5b8cff); }
  .subscription-feature { min-height: 48px; padding: 9px 11px; border: 1px solid #eef2f7; border-radius: 8px; background: #fbfcfe; transition: border-color .18s ease, background .18s ease; }
  .subscription-feature:hover { border-color: #bfd2ef; background: #f5f9ff; }
  .subscription-feature .fw-semibold { color: #344155; font-size: .8rem; }
  .subscription-loading { display: grid; min-height: 460px; place-items: center; }
  @media (max-width: 575px) { .subscription-hero :global(.card-body) { padding: 14px; } .subscription-hero :global(.d-flex.justify-content-between) { align-items: flex-start !important; flex-direction: column; gap: 10px; } }
</style>
