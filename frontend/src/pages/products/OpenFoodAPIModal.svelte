<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Swal from 'sweetalert2';

  import { t, lang, translate_org_type } from '../../i18n/i18n';

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let product_code = null;

  let loading = false;

  let notFound = false;
  let productData = null;

  async function loadProductData(code) {
    loading = true;

    console.log('Loading product data for code:', code);
    fetch(`https://world.openfoodfacts.net/api/v2/product/${code}.json`)
      .then(response => response.json())
      .then(data => {
        loading = false;
        if (data.status === 1) {
            notFound = false;
            productData = data.product;

          // You can dispatch an event or update the modal with the product data here
        } else {
            notFound = true;
        }
      })
      .catch(error => {
        loading = false;
        console.error('Error fetching product data:', error);
        Swal.fire({
          icon: 'error',
          title: t('Error'),
          text: t('An error occurred while fetching product data. Please try again later.'),
        });
      });
  }

  let showOpenFoodAPIModal = false;
  export async function openModal(code = null) {
    product_code = code;
    showOpenFoodAPIModal = true;

    await loadProductData(product_code);
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
      
    }, 10);
  }

  export function closeModal() {
    showOpenFoodAPIModal = false;
  }
</script>



{#if showOpenFoodAPIModal}
  <!-- Modal -->
  <div class="modal show d-block" id="openFoodAPIModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header bg-info text-white">
          <h5 class="modal-title">
            <i class="bi bi-bar-chart"></i> {t('Open Food API Modal')}
          </h5>
          <button type="button" class="btn-close" on:click={closeModal}></button>
        </div>
        <div class="modal-body">
            {#if loading}
                <div class="d-flex justify-content-center align-items-center" style="height: 200px;">
                <div class="spinner-border text-success" role="status">
                    <span class="visually-hidden">{t('Loading...')}</span>
                </div>
                </div>
            {:else if notFound}
                <div class="alert alert-warning text-center" role="alert">
                {t('Product not found in Open Food API.')}
                </div>
            {:else}
                <!-- Display product data here -->
                <h5 class="text-center">{productData.product_name}</h5>
                <p><strong>{t('Code')}:</strong> {productData.code}</p>
                <p><strong>{t('Brand')}:</strong> {productData.brands}</p>
                <p><strong>{t('Quantity')}:</strong> {productData.quantity}</p>
                <p><strong>{t('Categories')}:</strong> {productData.categories}</p>

                {#if productData.countries}
                    <p><strong>{t('Countries')}:</strong> {productData.countries}</p>
                {/if}
                <!-- images of product -->
                {#if productData.image_url}
                    <div class="text-center">
                        <img src={productData.image_url} alt={productData.product_name} class="img-fluid rounded" style="max-height: 200px;">
                    </div>
                {/if}

                {#if productData.image_ingredients_url}
                    <div class="text-center">
                        <img src={productData.image_ingredients_url} alt={productData.product_name} class="img-fluid rounded" style="max-height: 200px;">
                    </div>
                {/if}
            {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={closeModal}
            ><i class="bi bi-x-lg"></i> {t('Close')}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
