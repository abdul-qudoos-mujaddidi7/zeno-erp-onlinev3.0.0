<script>
  import { onceAsync } from '../../lib/onceAsync.js';
import { productImageApi } from '../../api/productImageApi.js';
import { departmentApi } from '../../api/departmentApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { productApi } from '../../api/productApi.js';
  import { productCategoryApi } from '../../api/productCategoryApi.js';
  import { productBrandApi } from '../../api/productBrandApi.js';
  import { productGenericApi } from '../../api/productGenericApi.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { toast } from '../../ToastUI/toast.js';

  let currency_default_images = [];
  import CategoryModal from './CategoryModal.svelte';
  import { getCachedImage, cacheImage } from './imageCache.js';

  let catModalRef = null; 
  import { time_units } from '../../time.js';

  import UnitModal from './UnitModal.svelte';

  let unitModalRef = null;

  export let warehouse_id = '';
  let showSearchImageModal = false;

  import BrandModal from '../settings/BrandModal.svelte';

  let brandModalRef = null;

  import GenericModal from '../settings/GenericModal.svelte';

  let genericModalRef = null;

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import FilterSelect from '../../components/common/FilterSelect.svelte';
  import {
    categoryIdOfUnit,
    unitBelongsToCategory,
    unitOptionsFor,
  } from './unitCategoryFilter.js';
  import { setDatePickers } from '../../calendar.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let enablePercent = false;
  let loadingProductData = false;
  let productData = null;
  let notFound = true;

  let loadingProductData2 = false;
  let productData2 = null;
  let notFound2 = true;

  let selectImage = false;

  import myData from './myData.json';
import { currencyApi } from '../../api/currencyApi.js';
import { userApi } from '../../api/userApi.js';
  let skus = {};
  myData.forEach((item, index) => {
    if (!item.sub_sku) {
    } else {
      if (skus[item.sub_sku]) {
        item.sub_sku = item.sub_sku + '-2';
      } else {
        skus[item.sub_sku] = 1;
      }
    }
  });
  Object.keys(skus).forEach((key) => {
    if (skus[key] > 1) {
      console.warn(`Duplicate SKU found: ${key} appears ${skus[key]} times.`);
    }
  });
  let myDataIndex = 0;

  async function loadFromData(index) {
    myDataIndex = index;
    imageBase64 = null;
    thumbnailBase64 = null;
    if (myData[index].sub_sku) {
      code = myData[index].sub_sku;
    } else {
      code = generateEAN13();
    }
    name = myData[index].name;
    buy_price = myData[index].default_purchase_price;
    sell_price = myData[index].default_sell_price;
    product_unit_id = myData[index].unit_id;
    brand_id = myData[index].brand_id;
    category_id = myData[index].category_id;
    department_id = myData[index].department_id;
    user_id = myData[index].user_id;
    alarm_quantity = myData[index].alert_quantity;
    if (myData[index].image) {
      await setRemoteImage(`/uploads/img/${myData[index].image}`);
    } else {
      modalImageUrl = '/img/no-image.png';
    }
    await addFromdata();
  }
  async function generateNameForExchange() {
    name = units.find((u) => u.id == product_unit_id)?.name || name;
    name = name + ' ' + t(currency);
    setTimeout(() => {
      if (window.mdb) {
        initMdbInputs();
        productModalEl?.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
    if (product_unit_id && currency) {
      let defaultImageBase64URL = currency_default_images.find(
        (di) => product_unit_id == di.product_unit_id && currency == di.currency,
      )?.base64_image_url;
      if (defaultImageBase64URL) {
        modalImageUrl = defaultImageBase64URL;
        imageBase64 = defaultImageBase64URL;
        thumbnailBase64 = defaultImageBase64URL;
      } else {
        modalImageUrl = null;
        imageBase64 = null;
        thumbnailBase64 = null;
      }
      let selectedUnit = units.find((u) => u.id == product_unit_id);
      if (selectedUnit.subunit_id == 1) {
        let subMultiple = Number(selectedUnit.subunit_multiple);
        if (subMultiple) {
          const subProduct =
            (await productApi.getAll({ status: 1 }))?.data?.find(
              (p) =>
                p.currency === currency &&
                Number(p.product_unit_id) === 1,
            ) || null;
          if (subProduct) {
            buy_price = Number(subProduct.buy_price) * subMultiple;
            buy_currency = subProduct.buy_currency;
            sell_price = Number(subProduct.sell_price) * subMultiple;
            sell_currency = subProduct.sell_currency;
          }
        }
      }
    }
  }

  async function addFromdata() {
    let data = {
      type: product_type,
      category_id: parseInt(category_id) || 0,
      department_id: parseInt(department_id) || 0,
      user_id: parseInt(user_id) || 0,
      brand_id: parseInt(brand_id) || 0,
      generic_id: parseInt(generic_id) || 0,
      product_unit_id: parseInt(product_unit_id) || 0,
      name: name.trim(),
      code: code.trim(),
      description,
      buy_price: parseFloat(buy_price) || 0,
      buy_currency: buy_currency,
      sell_price: parseFloat(sell_price) || 0,
      sell_currency: sell_currency,
      alarm_quantity: Number(alarm_quantity),
      alarm_expiry_days: Number(alarm_expiry_days),
      initial_warehouse_id: parseInt(selectedWarehouseId) || 0,
      initial_quantity: parseFloat(warehouseQuantity) || 0,
      status: parseInt(status) || 1,
    };
    try {
      const createdProduct = await productApi.create(data);
      const productId = createdProduct?.data?.id;

      if (imageBase64 && thumbnailBase64 && productId) {
        await productImageApi.replace({
          product_id: productId,
          image: imageBase64,
          thumbnail: thumbnailBase64,
          status: 1,
        });
      }
      myDataIndex += 1;
    } catch (err) {
      console.error(
        'Error adding product from data:',
        err + ' - Possible duplicate code: ' + code + ' at index ' + myDataIndex + ' with data ',
        data,
      );
    }

    loadFromData(myDataIndex);
  }

  async function loadProductData(code) {
    loadingProductData = true;

    console.log('Loading product data for code:', code);
    fetch(`https://world.openfoodfacts.net/api/v2/product/${code}.json`)
      .then((response) => response.json())
      .then((data) => {
        loadingProductData = false;
        if (data.status === 1) {
          notFound = false;
          productData = data.product;
        } else {
          notFound = true;
        }
      })
      .catch((error) => {
        loadingProductData = false;
        console.error('Error fetching product data:', error);
        toast.error(t('Error'), t('An error occurred while fetching product data. Please try again later.'));
      });

    loadingProductData2 = true;
    fetch(`https://world.openproductsfacts.org/api/v2/product/${code}.json`)
      .then((response) => response.json())
      .then((data) => {
        loadingProductData2 = false;
        if (data.status === 1) {
          notFound2 = false;
          productData2 = data.product2;
        } else {
          notFound2 = true;
        }
      })
      .catch((error) => {
        loadingProductData2 = false;
        console.error('Error fetching product data:', error);
        toast.error(t('Error'), t('An error occurred while fetching product data. Please try again later.'));
      });
  }

  /*
   * "Search Image" hands the typed name to Google Images in a new tab, where
   * the picture is picked and saved with the form.
   */
  function searchImageOnGoogle() {
    const query = String(name || '').trim();

    if (!query) {
      toast.error(t('Error'), t('Please enter product name first'));
      return;
    }

    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=2`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;

  $: enable_require_buy_sell_price = $settings_all.find((s) => s.key === 'enable_require_buy_sell_price')?.value == 1;
  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  $: enable_product_benefit_percentage =
    $settings_all.find((s) => s.key === 'enable_product_benefit_percentage')?.value == 1;
  $: default_product_benefit_percentage =
    $settings_all.find((s) => s.key === 'default_product_benefit_percentage')?.value || 0;

  export let type = 'product'; // default type, can be overridden by parent
  export let asPage = false;
  // Generate random EAN-13
  const countryCode = '608'; // Afghanistan GS1 prefix

  // Generate EAN-13 code

  export let showModal = false;
  export let editingId = null;

  export let categories = [];
  export let departments = [];
  export let users = [];
  export let brands = [];
  export let generics = [];
  export let units = [];
  export let unitCategories = [];
  export let warehouses = [];
  let currencies = [];
  let defaultCurrency = 'AFN';
  $: currencySelectOptions = currencies.map((cur) => ({ value: cur.code, label: t(cur.code) }));
  export let warehouse_products = [];
  export let previousProductId = null;
  export let nextProductId = null;
  export let onNavigateProduct = null;

  const dispatch = createEventDispatcher();

  const PRODUCT_FORM_RETURN_KEY = 'productFormReturnTo';
  const PRODUCT_FORM_RETURN_MAX_AGE = 2 * 60 * 60 * 1000;

  function getCurrentHashRoute() {
    if (typeof window === 'undefined') return '';

    return String(window.location.hash || '')
      .replace(/^#/, '')
      .split('?')[0]
      .replace(/\/+$/g, '');
  }

  function isTransactionFormRoute(route) {
    return (
      route === '/dashboard/sale-form/new' ||
      route.startsWith('/dashboard/sale-form/') ||
      route.startsWith('/dashboard/account-sale-form/') ||
      route === '/dashboard/purchase-form/new' ||
      route.startsWith('/dashboard/purchase-form/') ||
      route.startsWith('/dashboard/account-purchase-form/')
    );
  }

  function rememberProductFormReturnRoute(route) {
    if (typeof sessionStorage === 'undefined' || !isTransactionFormRoute(route)) return;

    sessionStorage.setItem(
      PRODUCT_FORM_RETURN_KEY,
      JSON.stringify({
        route,
        createdAt: Date.now(),
      }),
    );
  }

  function getProductFormReturnRoute() {
    if (typeof sessionStorage === 'undefined') return null;

    const rawValue = sessionStorage.getItem(PRODUCT_FORM_RETURN_KEY);
    if (!rawValue) return null;

    try {
      const saved = JSON.parse(rawValue);
      const route = saved?.route;
      const createdAt = Number(saved?.createdAt || 0);

      if (
        !isTransactionFormRoute(route) ||
        !createdAt ||
        Date.now() - createdAt > PRODUCT_FORM_RETURN_MAX_AGE
      ) {
        sessionStorage.removeItem(PRODUCT_FORM_RETURN_KEY);
        return null;
      }

      return route;
    } catch (error) {
      /* Support an older plain-string value, then remove invalid values. */
      if (isTransactionFormRoute(rawValue)) return rawValue;
      sessionStorage.removeItem(PRODUCT_FORM_RETURN_KEY);
      return null;
    }
  }

  function leaveProductFormPage() {
    const returnRoute = getProductFormReturnRoute();

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PRODUCT_FORM_RETURN_KEY);
    }

    push(returnRoute || (type === 'service' ? '/dashboard/services' : '/dashboard/stock'));
  }

  // let productModal;

  let productModalEl;
  let productModalInstance;

  function calculateCheckDigit(code12) {
    let sumOdd = 0;
    let sumEven = 0;
    for (let i = 0; i < code12.length; i++) {
      const digit = parseInt(code12[i]);
      if ((i + 1) % 2 === 0) sumEven += digit;
      else sumOdd += digit;
    }
    const total = sumOdd + sumEven * 3;
    return (10 - (total % 10)) % 10;
  }
  function generateEAN13(productCode = null) {
    // Use a product code if provided, else random 9-digit body
    let body = productCode
      ? productCode.padStart(9, '0') // make sure it’s 9 digits
      : Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');

    const code12 = countryCode + body; // first 12 digits
    const checkDigit = calculateCheckDigit(code12);

    return code12 + checkDigit;
  }

  async function findProductByCode(productCode) {
    const normalized = String(productCode || '').trim();
    if (!normalized) return null;

    const [active, deleted] = await Promise.all([
      productApi.getAll({ status: 1 }),
      productApi.getAll({ status: 0 }),
    ]);

    return (
      [...(active?.data || []), ...(deleted?.data || [])].find(
        (p) => String(p.code || '').trim() === normalized,
      ) || null
    );
  }

  async function isProductCodeTaken(productCode, ignoreProductId = null) {
    const normalized = String(productCode || '').trim();
    if (!normalized) return false;

    const existing = await findProductByCode(normalized);
    if (!existing) return false;
    if (ignoreProductId != null && Number(existing.id) === Number(ignoreProductId)) {
      return false;
    }
    return true;
  }

  async function generateUniqueProductCode() {
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = generateEAN13();
      if (!(await isProductCodeTaken(candidate))) {
        return candidate;
      }
    }
    throw new Error('Could not generate a unique product code. Please try again.');
  }

  async function resolveProductCodeForSave() {
    let normalized = String(code || '').trim();
    if (!normalized) {
      throw new Error(t('Code is required.'));
    }

    if (await isProductCodeTaken(normalized, editingId)) {
      if (_translate_org_type == 'exchange' && !editingId) {
        normalized = await generateUniqueProductCode();
        code = normalized;
      } else {
        const existing = await findProductByCode(normalized);
        const existingName = existing?.name ? ` (${existing.name})` : '';
        throw new Error(`${t('Product code already exists')}${existingName}. ${t('Use a different code.')}`);
      }
    }

    return normalized;
  }

  let category_id = _translate_org_type == 'exchange' || type == 'service' ? 1 : '';
  let department_id = '';
  let user_id = '';
  let percentage = Number(default_product_benefit_percentage || 0);
  let brand_id = '';
  let product_status = 'active';
  let generic_id = '';
  let product_unit_id = type == 'service' ? 1 : '';
  let name = '';
  let code = _translate_org_type == 'exchange' ? generateEAN13() : '';
  let currency = '';
  let description = '';
  let product_type = type == 'service' ? 'service' : 'good';
  let service_duration = 0;
  let service_duration_unit = 'minute';
  let buy_price = '';
  let buy_currency = defaultCurrency;
  let sell_price = '';
  let sell_currency = defaultCurrency;
  // let imageBlob = null;
  // let thumbnailBlob = null;
  let imageBase64 = null;
  let thumbnailBase64 = null;

  let modalImageUrl = null;
  let status = 1;
  let expiry_date = '';
  let manufacturing_date = '';

  function handleDateChange(inputName, value) {
    if (inputName === 'expiry_date') expiry_date = value || '';
    else if (inputName === 'manufacturing_date') manufacturing_date = value || '';
  }

  function syncProductDatePickerDisplays() {
    if (!productModalEl) return;
    productModalEl.querySelectorAll('.persianDatePicker input[type="date"]').forEach((input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /*
   * MDB Input only understands containers holding an input or textarea. The
   * unit-category select wrapper has a label but no input, and MDB's
   * date-placeholder logic then reads a null input and throws, so skip it.
   */
  function initMdbInputs(root = productModalEl) {
    if (!window.mdb || !root) return;
    root.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
      if (el.querySelector('input, textarea')) {
        new window.mdb.Input(el);
      }
    });
  }

  async function initProductDatePickers() {
    await tick();
    if (productModalEl) {
      setDatePickers(handleDateChange, productModalEl);
      syncProductDatePickerDisplays();
    }
  }

  $: if ((enable_expiry_date || enable_manufacturing_date) && productModalEl) {
    tick().then(() => setDatePickers(handleDateChange, productModalEl));
  }
  let batch = '';
  let alarm_quantity = '';
  let alarm_expiry_days = '';

  let selectedWarehouseId = warehouse_id;
  let warehouseQuantity = '';

  $: warehouseFilterOptions = [
    { value: '', label: t('Select Warehouse') },
    ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
  ];

  $: if (editingId && selectedWarehouseId) {
    const found = warehouse_products.find(
      (wp) => wp.product_id === editingId && wp.warehouse_id == selectedWarehouseId && wp.status === 1,
    );
    warehouseQuantity = found ? found.quantity : '';
  }

  const initializeOnce = onceAsync(async () => {
    await tick();

    const [departmentResponse, userResponse, currencyResponse, brandResponse, genericResponse] = await Promise.all([
      departmentApi.getAll({ status: 1 }), userApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }), productBrandApi.getAll({ status: 1 }),
      productGenericApi.getAll({ status: 1 }),
    ]);
    departments = departmentResponse?.data || [];
    users = userResponse?.data || [];

    if (_translate_org_type == 'exchange') {
      fetch('/js/currencyDefaultImages.json')
        .then((r) => r.json())
        .then((data) => {
          currency_default_images = data;
          console.log('Loaded currency_default_images: ', data.length);
        });
    }

    // const modalEl = document.getElementById('createProductModal');
    // if (window.mdb) {
    //   productModal = new window.mdb.Modal(modalEl);
    // }

    if (!asPage && window.mdb && productModalEl) {
      productModalInstance = new window.mdb.Modal(productModalEl);
    }
    setTimeout(() => {
      if (window.mdb) {
        initMdbInputs();
        productModalEl?.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
    currencies = currencyResponse?.data || [];
    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    currency = '';
    buy_currency = defaultCurrency;
    sell_currency = defaultCurrency;
    brands = brandResponse?.data || [];
    generics = genericResponse?.data || [];
    console.log('Loaded brands:', brands);
    console.log('Loaded generics:', generics);
    console.log('Default currency:', defaultCurrency);
    await initProductDatePickers();
  });
  export function initialize() { return initializeOnce(); }
  onMount(() => { void initialize().catch((error) => console.error('Product form initialization failed', error)); });

  export async function openModal() {
    const currentRoute = getCurrentHashRoute();

    /*
     * The quick Add button inside Sale or Purchase items still calls this
     * method. When called from either transaction form, open the full Product page
     * instead of displaying the modal.
     */
    if (!asPage && isTransactionFormRoute(currentRoute)) {
      rememberProductFormReturnRoute(currentRoute);
      push('/dashboard/product-form/new');
      return;
    }

    await initialize();
    selectImage = false;
    loadingProductData = false;

    productData = null;
    notFound = true;
    resetForm();
    if (!asPage) {
      productModalInstance?.show();
    }
    setTimeout(() => {
      if (window.mdb) {
        initMdbInputs();
      }
      initProductDatePickers();
    }, 100);
  }

  function closeProductForm() {
    dispatch('close');

    if (asPage) {
      leaveProductFormPage();
      return;
    }

    productModalInstance?.hide();
  }

  function navigateProductNeighbor(productId) {
    if (!productId) return;

    if (typeof onNavigateProduct === 'function') {
      onNavigateProduct(productId);
    } else {
      push(`/dashboard/product-form/${productId}`);
    }
  }

  function resetForm() {
    editingId = null;
    category_id = _translate_org_type == 'exchange' || type == 'service' ? 1 : '';
    department_id = '';
    user_id = '';
    brand_id = '';
    generic_id = '';
    percentage = Number(default_product_benefit_percentage || 0);
    product_status = 'active';
    product_type = type == 'service' ? 'service' : 'good';
    service_duration = 0;
    service_duration_unit = 'minute';
    product_unit_id = type == 'service' ? 1 : '';
    unit_category_id = '';
    if (product_unit_id) {
      applyUnitCategoryFromUnit(product_unit_id);
    }
    name = '';
    code = _translate_org_type == 'exchange' ? generateEAN13() : '';
    description = '';
    buy_price = '';
    buy_currency = defaultCurrency;
    currency = '';
    sell_price = '';
    sell_currency = defaultCurrency;
    status = 1;
    imageBase64 = null;
    thumbnailBase64 = null;
    expiry_date = '';
    manufacturing_date = '';
    batch = '';
    modalImageUrl = null;
    selectedWarehouseId = warehouse_id;
    warehouseQuantity = '';
    alarm_quantity = '';
    alarm_expiry_days = '';
    if (window.mdb) {
      initMdbInputs();
    }
  }

  let oldProductinitial_warehouse_id = null;
  export async function editProduct(product) {
    await initialize();
    resetForm();
    selectImage = false;
    loadingProductData = false;
    productData = null;
    notFound = true;
    product_type = product.type || (type == 'service' ? 'service' : 'good');
    service_duration = product.service_duration || 0;
    service_duration_unit = product.service_duration_unit || 'minute';
    editingId = product.id;
    product_status = product.product_status || 'active';
    category_id = product.category_id;
    department_id = product.department_id;
    percentage = Number(product.percentage) || 0;
    user_id = product.user_id;
    brand_id = product.brand_id;
    generic_id = product.generic_id;
    product_unit_id = product.product_unit_id;
    applyUnitCategoryFromUnit(product_unit_id);
    name = product.name;
    code = product.code;
    description = product.description;
    buy_price = Number(product.buy_price) || 0;
    buy_currency = product.buy_currency;
    expiry_date = product.expiry_date || '';
    manufacturing_date = product.manufacturing_date || '';
    batch = product.batch;
    currency = product.currency;
    sell_price = Number(product.sell_price) || 0;
    sell_currency = product.sell_currency;
    status = product.status;
    warehouseQuantity = product.initial_quantity;
    oldProductinitial_warehouse_id = product.initial_warehouse_id;

    if (product.percentage && enable_product_benefit_percentage) {
      enablePercent = true;
    } else {
      enablePercent = false;
    }

    setTimeout(() => {
      if (window.mdb) {
        initMdbInputs();
      }
    }, 100);

    alarm_quantity = Number(product.alarm_quantity);
    alarm_expiry_days = Number(product.alarm_expiry_days);
    const img = (await productImageApi.getAll({ product_id: product.id, status: 1 }))?.data?.[0] || null;
    if (img?.image) {
      product.modalImageUrl = img.image;
    } else {
      product.modalImageUrl = '/img/no-image.png';
    }
    modalImageUrl = product.modalImageUrl;

    imageBase64 = null;
    thumbnailBase64 = null;

    if (!asPage) {
      productModalInstance?.show();
    }
    await initProductDatePickers();
  }

  async function handlePasteImage(event) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;

        imageBase64 = await convertToWebP(file, 800);
        thumbnailBase64 = await convertToWebP(file, 240, 240);

        modalImageUrl = imageBase64;
        break; // only handle first image
      }
    }
  }

  function getUserName(user) {
    if (user) {
      return user.first_name ? user.first_name + ' ' + user.last_name : user.username;
    } else {
      return '';
    }
  }
  async function handleDropImage(event) {
    event.preventDefault();
    event.stopPropagation();

    let file = null;

    // ✅ 1. Try real file (desktop drag)
    if (event.dataTransfer.files.length > 0) {
      file = event.dataTransfer.files[0];
    }

    // ✅ 2. Try Firefox items
    if (!file && event.dataTransfer.items) {
      for (let item of event.dataTransfer.items) {
        if (item.kind === 'file') {
          file = item.getAsFile();
          break;
        }
      }
    }

    // ✅ 3. Firefox URL fallback (THIS IS YOUR CASE)
    if (!file) {
      let url =
        event.dataTransfer.getData('text/x-moz-url') ||
        event.dataTransfer.getData('text/uri-list') ||
        event.dataTransfer.getData('text/plain');

      if (url) {
        // text/x-moz-url may contain "url\ntext"
        url = url.split('\n')[0];

        try {
          const response = await fetch(url);
          const blob = await response.blob();

          if (!blob.type.startsWith('image/')) {
            console.log('Dropped URL is not an image');
            return;
          }

          file = new File([blob], 'dropped-image', { type: blob.type });
        } catch (err) {
          console.error('Failed to fetch dropped image:', err);
          return;
        }
      }
    }

    if (!file) {
      console.log('No valid image file or URL dropped', event.dataTransfer);
      return;
    }

    // ✅ Process image
    imageBase64 = await convertToWebP(file, 800);
    thumbnailBase64 = await convertToWebP(file, 240, 240);
    modalImageUrl = imageBase64;
  }

  async function saveProduct(save_type = 'normal') {
    const wasEditing = Boolean(editingId);
    const anotherProductId = wasEditing ? nextProductId || previousProductId : null;
    let errored = false;
    if (!category_id) {
      toast.error(t('Error'), t('Category is required.'));
      errored = true;
    }

    if (type == 'service' && !department_id) {
      toast.error(t('Error'), t('Department is required.'));
      errored = true;
    }

    if (!product_unit_id) {
      toast.error(t('Error'), t('Unit is required.'));
      errored = true;
    }

    if (!currency && _translate_org_type == 'exchange') {
      toast.error(t('Error'), t('Currency is required.'));
      errored = true;
    }

    if (!String(name ?? '').trim()) {
      toast.error(t('Error'), t('Name is required.'));
      errored = true;
    }
    if (!String(code || '').trim()) {
      toast.error(t('Error'), t('Code is required.'));
      errored = true;
    }
    if (type != 'service' && !buy_price && enable_require_buy_sell_price) {
      toast.error(t('Error'), t('Buy price is required.'));
      errored = true;
    }
    if (!sell_price && enable_require_buy_sell_price) {
      toast.error(t('Error'), t('Sell price is required.'));
      errored = true;
    }

    if (type == 'sale') {
      if (!selectedWarehouseId || !warehouseQuantity || warehouseQuantity <= 0) {
        toast.error(t('Error'), t('For sales, you must select a warehouse and enter a quantity greater than zero.'));
        errored = true;
      }
    }
    if (!oldProductinitial_warehouse_id && !selectedWarehouseId && warehouseQuantity > 0) {
      toast.error(
        t('Error'),
        t(
          'You have entered a warehouse quantity but have not selected a warehouse. Please select a warehouse or set the quantity to zero.',
        ),
      );
      errored = true;
    }

    if (selectedWarehouseId && warehouseQuantity == 0) {
      toast.error(
        t('Error'),
        t(
          'You have selected a warehouse but have set the quantity to zero. Please enter a quantity or deselect the warehouse.',
        ),
      );

      errored = true;
    }

    if (errored) {
      return;
    }

    try {
      let productId;
      const productCode = await resolveProductCodeForSave();
      /*
       * A product saved before its organization used a currency stores NULL
       * there (the pharmacy sheet shows «AFN» from buy/sell currency only), so
       * trimming it straight away threw "Cannot read properties of null".
       */
      const safeName = String(name ?? '').trim();
      const safeCurrency = String(currency ?? '').trim();
      percentage = enablePercent ? Number(percentage) || 0 : 0;
      if (editingId) {
        let oldProduct = (await productApi.getById(editingId))?.data || null;
        if (oldProduct && Number(oldProduct.initial_warehouse_id) == 0 && selectedWarehouseId) {
          await productApi.update(editingId, {
            category_id: parseInt(category_id) || 0,
            department_id: parseInt(department_id) || 0,
            user_id: parseInt(user_id) || 0,
            type: product_type,
            service_duration: service_duration,
            service_duration_unit: service_duration_unit,
            brand_id: parseInt(brand_id) || 0,
            generic_id: parseInt(generic_id) || 0,
            product_unit_id: parseInt(product_unit_id) || 0,
            name: safeName,
            code: productCode,
            product_status: product_status,
            percentage: Number(percentage) || 0,
            description,
            buy_price: parseFloat(buy_price) || 0,
            buy_currency: buy_currency,
            currency: safeCurrency,
            sell_price: parseFloat(sell_price) || 0,
            sell_currency: sell_currency,
            status: parseInt(status) || 1,
            alarm_quantity: Number(alarm_quantity),
            expiry_date: expiry_date,
            manufacturing_date: manufacturing_date,
            batch: batch,
            alarm_expiry_days: Number(alarm_expiry_days),
            initial_warehouse_id: parseInt(selectedWarehouseId) || 0,
            initial_quantity: parseFloat(warehouseQuantity) || 0,
          });

          productId = editingId;
        } else {
          await productApi.update(editingId, {
            category_id: parseInt(category_id) || 0,
            department_id: parseInt(department_id) || 0,
            user_id: parseInt(user_id) || 0,
            type: product_type,
            service_duration: service_duration,
            service_duration_unit: service_duration_unit,
            brand_id: parseInt(brand_id) || 0,
            generic_id: parseInt(generic_id) || 0,
            product_unit_id: parseInt(product_unit_id) || 0,
            name: safeName,
            code: productCode,
            product_status: product_status,
            percentage: Number(percentage) || 0,
            description,
            alarm_quantity: Number(alarm_quantity),
            expiry_date: expiry_date,
            manufacturing_date: manufacturing_date,
            batch: batch,
            alarm_expiry_days: Number(alarm_expiry_days),
            buy_price: parseFloat(buy_price) || 0,
            buy_currency: buy_currency,
            currency: safeCurrency,
            sell_price: parseFloat(sell_price) || 0,
            sell_currency: sell_currency,
            status: parseInt(status) || 1,
          });
          productId = editingId;
        }
      } else {
        const createdProduct = await productApi.create({
          category_id: parseInt(category_id) || 0,
          department_id: parseInt(department_id) || 0,
          user_id: parseInt(user_id) || 0,
          brand_id: parseInt(brand_id) || 0,
          type: product_type,
          service_duration: service_duration,
          service_duration_unit: service_duration_unit,
          generic_id: parseInt(generic_id) || 0,
          product_unit_id: parseInt(product_unit_id) || 0,
          name: safeName,
          code: productCode,
          percentage: Number(percentage) || 0,
          description,
          product_status: product_status,
          buy_price: parseFloat(buy_price) || 0,
          buy_currency: buy_currency,
          currency: safeCurrency,
          sell_price: parseFloat(sell_price) || 0,
          sell_currency: sell_currency,
          alarm_quantity: Number(alarm_quantity),
          expiry_date: expiry_date,
          manufacturing_date: manufacturing_date,
          batch: batch,
          alarm_expiry_days: Number(alarm_expiry_days),
          initial_warehouse_id: parseInt(selectedWarehouseId) || 0,
          initial_quantity: parseFloat(warehouseQuantity) || 0,
          status: parseInt(status) || 1,
        });
        productId = createdProduct?.data?.id;
      }

      if (imageBase64 && thumbnailBase64) {
        await productImageApi.replace({
          product_id: productId,
          image: imageBase64,
          thumbnail: thumbnailBase64,
          status: 1,
        });
      }
      toast.success(
        t('Success'),
        wasEditing ? t('Product Updated Successfully!') : t('Product Added Successfully!'),
      );
      dispatch('saved', { id: productId, save_type });

      if (asPage) {
        /*
         * Create mode: save the product and clear the form for a new product.
         * Update mode: update the current product and open another existing
         * product for editing instead of incorrectly opening the New Product page.
         */
        if (save_type === 'edit-another' && wasEditing) {
          if (anotherProductId) {
            navigateProductNeighbor(anotherProductId);
          }
          return;
        }

        if (save_type === 'again' && !wasEditing) {
          resetForm();
          setTimeout(() => {
            if (window.mdb) {
              initMdbInputs();
              productModalEl?.querySelectorAll('.dropdown-toggle').forEach((el) => new window.mdb.Dropdown(el));
            }
          }, 100);
          return;
        }

        leaveProductFormPage();
      } else {
        productModalInstance?.hide();
      }
    } catch (err) {
      toast.error(t('Error'), err.message || t('An error occurred while saving the product.'));
      console.error('Save error:', err);
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    imageBase64 = await convertToWebP(file, 800);
    thumbnailBase64 = await convertToWebP(file, 240, 240);
    modalImageUrl = imageBase64;
  }

  async function setRemoteImage(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], 'img', { type: blob.type });
      imageBase64 = await convertToWebP(file, 800);
      thumbnailBase64 = await convertToWebP(file, 240, 240);
      modalImageUrl = imageBase64;
    } catch (err) {
      console.error('Error setting remote image:', err);
    }
  }

  function convertToWebP(file, maxWidth = 800, fixedSize = null) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;
        if (fixedSize) {
          const canvasSize = fixedSize;
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;
          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
        } else {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      reader.readAsDataURL(file);
    });
  }

  let category_search = '';
  let showCategoryDropdown = false;
  let filteredCategories = categories;
  let form_category_search_input = null;

  let unit_search = '';
  let showUnitDropdown = false;
  let filteredUnits = units;
  let form_unit_search_input = null;

  /* Empty means "every category", so the unit picker keeps showing all units
   * until a category is chosen. */
  let unit_category_id = '';
  $: unitCategoryOptions = [
    { value: '', label: t('All Units') },
    ...unitCategories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  /* The unit category picker is the same widget as the category picker above:
   * "همه واحدها" stays at the top as the way back to every category, and the
   * rest of the list follows the search box. */
  let unitCategorySearch = '';
  let openUnitCategoryMenu = false;
  $: filteredUnitCategoryOptions = filterBySearch(
    unitCategoryOptions,
    unitCategorySearch,
    (row) => row.label,
  );
  $: pageUnitCategoryLabel =
    unitCategoryOptions.find((row) => String(row.value) === String(unit_category_id))?.label ||
    t('All Units');

  /*
   * The unit picker is narrowed by the chosen category first and by the typed
   * search second. Those rules live in unitCategoryFilter.js so they can be
   * tested against realistic data; every search/focus handler below goes
   * through this one wrapper.
   */
  function listUnits(search = unit_search) {
    return unitOptionsFor(units, unit_category_id, search);
  }

  function selectUnitCategory(categoryId) {
    unit_category_id = categoryId === '' || categoryId == null ? '' : categoryId;

    /* The selected unit cannot belong to the newly chosen category, so the
     * picker starts from an empty selection rather than keeping a unit the
     * list no longer shows. */
    if (
      product_unit_id &&
      !unitBelongsToCategory(units, product_unit_id, unit_category_id)
    ) {
      product_unit_id = '';
      unit_search = '';
    }

    filteredUnits = listUnits('');
  }

  /* Keeps the category in step with whichever unit is already selected:
   * opening a product selects its unit's category, and a unit created from
   * this form brings its own category along. */
  function applyUnitCategoryFromUnit(unitId) {
    unit_category_id = categoryIdOfUnit(units, unitId);
    filteredUnits = listUnits();
  }

  let brand_search = '';
  let showBrandDropdown = false;
  let filteredBrands = brands;
  let form_brand_search_input = null;

  let generic_search = '';
  let showGenericDropdown = false;
  let filteredGenerics = generics;
  let form_generic_search_input = null;

  let department_search = '';
  let showDepartmentDropdown = false;
  let filteredDepartments = departments;
  let form_department_search_input = null;

  let user_search = '';
  let showUserDropdown = false;
  let filteredUsers = users;
  let form_user_search_input = null;

  /* ===================================================================
     PRODUCT PAGE (ProductNew.dc.html)
     The page shell shows every value it needs twice: once in a field and
     once in the “خلاصه ثبت” panel. Everything the panel prints is derived
     here instead of inside the markup, because Svelte compiles a call in
     the markup as $.untrack and the printed value would then never follow
     the field again.
     =================================================================== */
  let openBuyCurrencyMenu = false;
  let openSellCurrencyMenu = false;
  let openWarehouseMenu = false;
  let buyCurrencySearch = '';
  let sellCurrencySearch = '';

  $: pageCategoryName = categories.find((row) => String(row.id) === String(category_id))?.name || '';
  $: pageUnitName = units.find((row) => String(row.id) === String(product_unit_id))?.name || '';
  $: pageUnitWord = pageUnitName || t('Unit');
  $: pageBrandName = brands.find((row) => String(row.id) === String(brand_id))?.name || '';
  $: pageGenericName = generics.find((row) => String(row.id) === String(generic_id))?.name || '';
  $: pageWarehouseName =
    warehouses.find((row) => String(row.id) === String(selectedWarehouseId))?.name || '';
  $: pageDepartmentName =
    departments.find((row) => String(row.id) === String(department_id))?.name || '';
  $: pageUser = users.find((row) => String(row.id) === String(user_id)) || null;
  $: pageUserName = pageUser
    ? `${pageUser.first_name || ''} ${pageUser.last_name || ''}`.trim() || pageUser.username
    : '';

  $: pageBuyCurrency = buy_currency || defaultCurrency;
  $: pageSellCurrency = sell_currency || defaultCurrency;
  $: pageBuySymbol =
    currencies.find((row) => row.code === pageBuyCurrency)?.symbol || pageBuyCurrency;
  $: pageSellSymbol =
    currencies.find((row) => row.code === pageSellCurrency)?.symbol || pageSellCurrency;

  $: filteredBuyCurrencies = filterBySearch(
    currencies,
    buyCurrencySearch,
    (row) => `${t(row.code)} ${row.code}`,
  );
  $: filteredSellCurrencies = filterBySearch(
    currencies,
    sellCurrencySearch,
    (row) => `${t(row.code)} ${row.code}`,
  );

  /* Same second line the Sale form shows: the base currency has no rate, every
     other one reads "1 € = 70 ؋". */
  function pageCurrencyRate(row) {
    const base = currencies.find((cur) => cur.isDefault == 1);
    const rate = Number(row?.exchangeRate);
    if (!row || !base || row.code === base.code || !Number.isFinite(rate) || rate <= 0) return '';

    return `1 ${row.symbol || row.code} = ${rate.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    })} ${base.symbol || base.code}`;
  }

  $: pageBuyText = (Number(buy_price) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  $: pageSellText = (Number(sell_price) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  $: pageProfit = (Number(sell_price) || 0) - (Number(buy_price) || 0);
  $: pageProfitText = Math.abs(pageProfit).toLocaleString('en-US', { maximumFractionDigits: 2 });
  $: pageProfitSign = pageProfit < 0 ? '-' : '+';
  $: pageMargin = Number(sell_price) > 0 ? (pageProfit / Number(sell_price)) * 100 : 0;
  $: pageMarginText = `${Math.abs(pageMargin).toFixed(1)}%`;
  $: pageMarginWidth = `${Math.min(100, Math.max(0, Math.abs(pageMargin)))}%`;
  $: pageMarginPositive = pageMargin >= 0;

  /* The Sell box prints the same two hints as the reference: the markup over
     cost while the price is typed as an amount, the resulting amount while it is
     typed as a percentage. A price quoted in another currency is converted into
     the buy currency first, like the reference's `rate()` does. */
  $: pageBuyRate = Number(currencies.find((row) => row.code === pageBuyCurrency)?.exchangeRate) || 1;
  $: pageSellRate =
    Number(currencies.find((row) => row.code === pageSellCurrency)?.exchangeRate) || 1;
  $: pageSellInBuy = ((Number(sell_price) || 0) * pageSellRate) / pageBuyRate;
  $: pageMarkup =
    Number(buy_price) > 0 ? ((pageSellInBuy - Number(buy_price)) / Number(buy_price)) * 100 : 0;
  $: pageSellHint =
    Number(buy_price) > 0 && Number(sell_price) > 0
      ? enablePercent
        ? `= ${pageSellInBuy.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        : `${Math.round(pageMarkup).toLocaleString('en-US')}٪`
      : '';

  $: pageStockQuantity = Number(warehouseQuantity) || 0;
  $: pageStockText = pageStockQuantity.toLocaleString('en-US', { maximumFractionDigits: 3 });
  $: pageStockValueText = (pageStockQuantity * (Number(buy_price) || 0)).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });

  /* Name, code, category and unit are the four fields the save guard and the
     database both insist on, so they drive the completeness meter. */
  $: pageFilledFields = [name, code, category_id, product_unit_id].filter((value) =>
    String(value ?? '').trim(),
  ).length;
  $: pageProgressWidth = `${Math.round((pageFilledFields / 4) * 100)}%`;
  $: pageComplete = pageFilledFields === 4;

  /** Keeps the two “نرخ فروش” modes in step with the price they derive. */
  function setPercentMode(enabled) {
    if (enablePercent === enabled) return;

    enablePercent = enabled;

    if (enabled) {
      /* A percentage is added to the cost, so it is quoted in the buy currency.
         Switching a price that is already typed over keeps that price: the
         percentage is derived from it, like the reference does, and the stored
         percentage only ever fills an empty form. */
      sell_currency = buy_currency;

      const buyAmount = parseFloat(buy_price) || 0;
      if (buyAmount > 0) {
        if (Number(sell_price) > 0) {
          percentage = String(Math.round(((pageSellInBuy - buyAmount) / buyAmount) * 100));
        }
        sell_price = (buyAmount * (1 + (parseFloat(percentage) || 0) / 100)).toFixed(3);
      }
      return;
    }

    if (buy_price && sell_price < buy_price) {
      sell_price = buy_price;
    }
    sell_currency = buy_currency;
  }

  /* One click anywhere outside a picker closes it, so two panels can never
     stay open at the same time. */
  function handlePageShellClick(event) {
    const picker = event.target.closest?.('[data-pick]')?.getAttribute('data-pick') || '';

    if (picker !== 'cat') showCategoryDropdown = false;
    if (picker !== 'brand') showBrandDropdown = false;
    if (picker !== 'generic') showGenericDropdown = false;
    if (picker !== 'unit') showUnitDropdown = false;
    if (picker !== 'unitcat') openUnitCategoryMenu = false;
    if (picker !== 'wh') openWarehouseMenu = false;
    if (picker !== 'buycur') openBuyCurrencyMenu = false;
    if (picker !== 'sellcur') openSellCurrencyMenu = false;
  }

  function filterBySearch(rows, search, labelOf = (row) => row.name) {
    const needle = String(search || '').trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) => String(labelOf(row) || '').toLowerCase().includes(needle));
  }
</script>

<div
  class={asPage ? 'product-form-page' : 'product-modal-root simple-modal'}
  class:modal={!asPage}
  class:fade={!asPage}
  class:qa-service-modal={!asPage && type == 'service'}
  dir={t('dir')}
  id={asPage ? 'productFormPage' : 'createProductModal'}
  bind:this={productModalEl}
  tabindex={asPage ? undefined : '-1'}
  aria-hidden={asPage ? undefined : 'true'}>
  <div class={asPage ? 'product-form-page__body' : 'modal-dialog modal-dialog-centered modal-lg simple-modal__dialog simple-modal__dialog--wide'}>
    <div class={asPage ? 'product-form-page__inner' : 'modal-content product-modal simple-modal__panel'}>
      {#if !asPage}
      <div class="product-modal-header">
        <div class="product-modal-heading">
          <div class="product-modal-header__text">
            <h2 class="product-modal-title">
              {#if type == 'service'}
                {editingId ? t('Update Service') : t('New Service')}
              {:else}
                {editingId ? t('Update Product') : t('New Product')}
              {/if}
            </h2>
            <p class="product-modal-subtitle">
              {#if type == 'service'}
                {t('Service modal subtitle')}
              {:else}
                {t('Product modal subtitle')}
              {/if}
            </p>
          </div>
        </div>
        <button type="button" class="product-modal-close" data-mdb-dismiss={asPage ? undefined : 'modal'} aria-label={t('Close')} on:click={closeProductForm}>
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      {/if}

      <div class={asPage ? 'product-form-body' : 'modal-body product-modal-body'}>
        {#if asPage}
        <!-- Product page — geometry copied from ProductNew.dc.html -->
        <div class="pf-page" on:click={handlePageShellClick}>
          <!-- The sheet starts with its first card: no title block, no icon. The
               heading stays for screen readers and the product stepper keeps the
               corner it used to sit in, because it only exists while editing. -->
          <h1 class="pf-vh">
            {editingId
              ? t(type === 'service' ? 'Update Service' : 'Update Product')
              : t(type === 'service' ? 'New Service' : 'New Product')}
          </h1>
          {#if editingId}
            <div class="pf-nav">
              <button
                type="button"
                class="pf-iconbtn"
                disabled={!previousProductId}
                title={t('Previous')}
                aria-label={t('Previous')}
                on:click={() => navigateProductNeighbor(previousProductId)}>
                <i class="ms" aria-hidden="true">chevron_right</i>
              </button>
              <button
                type="button"
                class="pf-iconbtn"
                disabled={!nextProductId}
                title={t('Next')}
                aria-label={t('Next')}
                on:click={() => navigateProductNeighbor(nextProductId)}>
                <i class="ms" aria-hidden="true">chevron_left</i>
              </button>
            </div>
          {/if}

          <div class="pf-layout">
            <div class="pf-main">
              <section class="pf-card" aria-labelledby="pf-sec-basic">
                <h3 id="pf-sec-basic" class="pf-card__hd">
                  <i class="ms f" aria-hidden="true">badge</i>{t('Basic Information')}
                </h3>

                <div class="pf-grid">
                  <div class="pf-f pf-f--2">
                    <div class="pf-label">
                      <label for="pf-name">{t('Name')}<span class="pf-req" aria-hidden="true">*</span></label>
                    </div>
                    <div class="pf-box">
                      <input
                        id="pf-name"
                        type="text"
                        autocomplete="off"
                        placeholder={t('Name')}
                        bind:value={name} />
                    </div>
                  </div>

                  {#if _translate_org_type != 'exchange'}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-code">{t('Code')}<span class="pf-req" aria-hidden="true">*</span></label>
                        <button
                          type="button"
                          class="pf-mini"
                          title={t('Create Code')}
                          on:click={() => (code = generateEAN13())}>
                          <i class="ms" aria-hidden="true">auto_awesome</i>{t('Auto')}
                        </button>
                      </div>
                      <div class="pf-box">
                        <input
                          id="pf-code"
                          type="text"
                          dir="ltr"
                          autocomplete="off"
                          placeholder={t('Code')}
                          bind:value={code}
                          on:keydown={(event) => {
                            if (event.key === 'Enter') {
                              selectImage = true;
                              loadProductData(code);
                            }
                          }} />
                      </div>
                    </div>
                  {/if}

                  <div class="pf-f" data-pick="cat">
                    <div class="pf-label">
                      <span id="pf-l-cat">{t('Category')}<span class="pf-req" aria-hidden="true">*</span></span>
                      <button
                        type="button"
                        class="pf-mini"
                        title={t('Create Product Category')}
                        aria-label={t('Create Product Category')}
                        on:click={() => catModalRef.openProductCategoryModal()}>
                        <i class="ms" aria-hidden="true">add</i>
                      </button>
                    </div>
                    <div class="pf-pick">
                      <button
                        type="button"
                        class="pf-box pf-box--btn"
                        aria-labelledby="pf-l-cat"
                        aria-haspopup="listbox"
                        aria-expanded={showCategoryDropdown}
                        on:click={() => {
                          category_search = '';
                          filteredCategories = categories;
                          showCategoryDropdown = !showCategoryDropdown;
                        }}>
                        <span class="pf-pick__t" class:is-empty={!pageCategoryName}>
                          {pageCategoryName || t('Select Category')}
                        </span>
                        <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                      </button>

                      {#if showCategoryDropdown}
                        <div class="pf-menu" role="listbox" aria-labelledby="pf-l-cat">
                          <label class="pf-menu__search">
                            <i class="ms" aria-hidden="true">search</i>
                            <input
                              type="search"
                              placeholder={t('Search')}
                              autocomplete="off"
                              bind:value={category_search}
                              on:input={() => (filteredCategories = filterBySearch(categories, category_search))} />
                          </label>
                          <div class="pf-menu__list">
                            {#each filteredCategories as row (row.id)}
                              <button
                                type="button"
                                role="option"
                                aria-selected={String(category_id) === String(row.id)}
                                class="pf-menu__opt"
                                class:is-on={String(category_id) === String(row.id)}
                                on:click={() => {
                                  category_id = row.id;
                                  category_search = '';
                                  showCategoryDropdown = false;
                                }}>
                                <span class="pf-menu__name">{row.name}</span>
                                {#if String(category_id) === String(row.id)}
                                  <i class="ms" aria-hidden="true">check</i>
                                {/if}
                              </button>
                            {/each}
                            {#if !filteredCategories.length}
                              <span class="pf-menu__empty">{t('No results found')}</span>
                            {/if}
                          </div>
                          {#if category_id}
                            <button
                              type="button"
                              class="pf-menu__clear"
                              on:click={() => {
                                category_id = '';
                                category_search = '';
                                filteredCategories = categories;
                                showCategoryDropdown = false;
                              }}>
                              <i class="ms" aria-hidden="true">backspace</i>{t('Clear selection')}
                            </button>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>

                  {#if enable_brands && type != 'service'}
                    <div class="pf-f" data-pick="brand">
                      <div class="pf-label">
                        <span id="pf-l-brand">{t('Brand')}</span>
                        <button
                          type="button"
                          class="pf-mini"
                          title={t('Create Product Brand')}
                          aria-label={t('Create Product Brand')}
                          on:click={() => brandModalRef.openProductBrandModal()}>
                          <i class="ms" aria-hidden="true">add</i>
                        </button>
                      </div>
                      <div class="pf-pick">
                        <button
                          type="button"
                          class="pf-box pf-box--btn"
                          aria-labelledby="pf-l-brand"
                          aria-haspopup="listbox"
                          aria-expanded={showBrandDropdown}
                          on:click={() => {
                            brand_search = '';
                            filteredBrands = brands;
                            showBrandDropdown = !showBrandDropdown;
                          }}>
                          <span class="pf-pick__t" class:is-empty={!pageBrandName}>
                            {pageBrandName || t('Select Brand')}
                          </span>
                          <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                        </button>

                        {#if showBrandDropdown}
                          <div class="pf-menu" role="listbox" aria-labelledby="pf-l-brand">
                            <label class="pf-menu__search">
                              <i class="ms" aria-hidden="true">search</i>
                              <input
                                type="search"
                                placeholder={t('Search')}
                                autocomplete="off"
                                bind:value={brand_search}
                                on:input={() => (filteredBrands = filterBySearch(brands, brand_search))} />
                            </label>
                            <div class="pf-menu__list">
                              {#each filteredBrands as row (row.id)}
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={String(brand_id) === String(row.id)}
                                  class="pf-menu__opt"
                                  class:is-on={String(brand_id) === String(row.id)}
                                  on:click={() => {
                                    brand_id = row.id;
                                    brand_search = '';
                                    showBrandDropdown = false;
                                  }}>
                                  <span class="pf-menu__name">{row.name}</span>
                                  {#if String(brand_id) === String(row.id)}
                                    <i class="ms" aria-hidden="true">check</i>
                                  {/if}
                                </button>
                              {/each}
                              {#if !filteredBrands.length}
                                <span class="pf-menu__empty">{t('No results found')}</span>
                              {/if}
                            </div>
                            {#if brand_id}
                              <button
                                type="button"
                                class="pf-menu__clear"
                                on:click={() => {
                                  brand_id = '';
                                  brand_search = '';
                                  filteredBrands = brands;
                                  showBrandDropdown = false;
                                }}>
                                <i class="ms" aria-hidden="true">backspace</i>{t('Clear selection')}
                              </button>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  {#if enable_generics && type != 'service'}
                    <div class="pf-f" data-pick="generic">
                      <div class="pf-label">
                        <span id="pf-l-gen">{t('Generic')}</span>
                        <button
                          type="button"
                          class="pf-mini"
                          title={t('Create Product Generic')}
                          aria-label={t('Create Product Generic')}
                          on:click={() => genericModalRef.openProductGenericModal()}>
                          <i class="ms" aria-hidden="true">add</i>
                        </button>
                      </div>
                      <div class="pf-pick">
                        <button
                          type="button"
                          class="pf-box pf-box--btn"
                          aria-labelledby="pf-l-gen"
                          aria-haspopup="listbox"
                          aria-expanded={showGenericDropdown}
                          on:click={() => {
                            generic_search = '';
                            filteredGenerics = generics;
                            showGenericDropdown = !showGenericDropdown;
                          }}>
                          <span class="pf-pick__t" class:is-empty={!pageGenericName}>
                            {pageGenericName || t('Select Generic')}
                          </span>
                          <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                        </button>

                        {#if showGenericDropdown}
                          <div class="pf-menu" role="listbox" aria-labelledby="pf-l-gen">
                            <label class="pf-menu__search">
                              <i class="ms" aria-hidden="true">search</i>
                              <input
                                type="search"
                                placeholder={t('Search')}
                                autocomplete="off"
                                bind:value={generic_search}
                                on:input={() => (filteredGenerics = filterBySearch(generics, generic_search))} />
                            </label>
                            <div class="pf-menu__list">
                              {#each filteredGenerics as row (row.id)}
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={String(generic_id) === String(row.id)}
                                  class="pf-menu__opt"
                                  class:is-on={String(generic_id) === String(row.id)}
                                  on:click={() => {
                                    generic_id = row.id;
                                    generic_search = '';
                                    showGenericDropdown = false;
                                  }}>
                                  <span class="pf-menu__name">{row.name}</span>
                                  {#if String(generic_id) === String(row.id)}
                                    <i class="ms" aria-hidden="true">check</i>
                                  {/if}
                                </button>
                              {/each}
                              {#if !filteredGenerics.length}
                                <span class="pf-menu__empty">{t('No results found')}</span>
                              {/if}
                            </div>
                            {#if generic_id}
                              <button
                                type="button"
                                class="pf-menu__clear"
                                on:click={() => {
                                  generic_id = '';
                                  generic_search = '';
                                  filteredGenerics = generics;
                                  showGenericDropdown = false;
                                }}>
                                <i class="ms" aria-hidden="true">backspace</i>{t('Clear selection')}
                              </button>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  <div class="pf-f" data-pick="unit">
                    <div class="pf-label">
                      <span id="pf-l-unit">{t('Unit')}<span class="pf-req" aria-hidden="true">*</span></span>
                      <button
                        type="button"
                        class="pf-mini"
                        title={t('Create Unit')}
                        aria-label={t('Create Unit')}
                        on:click={() => unitModalRef.openUnitModal()}>
                        <i class="ms" aria-hidden="true">add</i>
                      </button>
                    </div>
                    <div class="pf-pick">
                      <button
                        type="button"
                        class="pf-box pf-box--btn"
                        aria-labelledby="pf-l-unit"
                        aria-haspopup="listbox"
                        aria-expanded={showUnitDropdown}
                        on:click={() => {
                          unit_search = '';
                          filteredUnits = listUnits('');
                          showUnitDropdown = !showUnitDropdown;
                        }}>
                        <span class="pf-pick__t" class:is-empty={!pageUnitName}>
                          {pageUnitName || t('Select Unit')}
                        </span>
                        <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                      </button>

                      {#if showUnitDropdown}
                        <div class="pf-menu" role="listbox" aria-labelledby="pf-l-unit">
                          <label class="pf-menu__search">
                            <i class="ms" aria-hidden="true">search</i>
                            <input
                              type="search"
                              placeholder={t('Search')}
                              autocomplete="off"
                              bind:value={unit_search}
                              on:input={() => (filteredUnits = listUnits())} />
                          </label>
                          <div class="pf-menu__list">
                            {#each filteredUnits as row (row.id)}
                              <button
                                type="button"
                                role="option"
                                aria-selected={String(product_unit_id) === String(row.id)}
                                class="pf-menu__opt"
                                class:is-on={String(product_unit_id) === String(row.id)}
                                on:click={() => {
                                  product_unit_id = row.id;
                                  unit_search = '';
                                  applyUnitCategoryFromUnit(row.id);
                                  showUnitDropdown = false;
                                }}>
                                <span class="pf-menu__name">{row.name}</span>
                                {#if String(product_unit_id) === String(row.id)}
                                  <i class="ms" aria-hidden="true">check</i>
                                {/if}
                              </button>
                            {/each}
                            {#if !filteredUnits.length}
                              <span class="pf-menu__empty">{t('No results found')}</span>
                            {/if}
                          </div>
                          {#if product_unit_id}
                            <button
                              type="button"
                              class="pf-menu__clear"
                              on:click={() => {
                                product_unit_id = '';
                                unit_search = '';
                                filteredUnits = listUnits('');
                                showUnitDropdown = false;
                              }}>
                              <i class="ms" aria-hidden="true">backspace</i>{t('Clear selection')}
                            </button>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>

                  {#if unitCategories.length}
                    <div class="pf-f" data-pick="unitcat">
                      <div class="pf-label">
                        <span id="pf-l-unit-category">{t('Unit Category')}</span>
                      </div>
                      <div class="pf-pick">
                        <button
                          type="button"
                          class="pf-box pf-box--btn"
                          aria-labelledby="pf-l-unit-category"
                          aria-haspopup="listbox"
                          aria-expanded={openUnitCategoryMenu}
                          on:click={() => {
                            unitCategorySearch = '';
                            openUnitCategoryMenu = !openUnitCategoryMenu;
                          }}>
                          <span class="pf-pick__t" class:is-empty={!unit_category_id}>{pageUnitCategoryLabel}</span>
                          <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                        </button>

                        {#if openUnitCategoryMenu}
                          <div class="pf-menu" role="listbox" aria-labelledby="pf-l-unit-category">
                            <label class="pf-menu__search">
                              <i class="ms" aria-hidden="true">search</i>
                              <input
                                type="search"
                                placeholder={t('Search')}
                                autocomplete="off"
                                bind:value={unitCategorySearch} />
                            </label>
                            <div class="pf-menu__list">
                              {#each filteredUnitCategoryOptions as row (row.value)}
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={String(unit_category_id) === String(row.value)}
                                  class="pf-menu__opt"
                                  class:is-on={String(unit_category_id) === String(row.value)}
                                  on:click={() => {
                                    selectUnitCategory(row.value);
                                    unitCategorySearch = '';
                                    openUnitCategoryMenu = false;
                                  }}>
                                  <span class="pf-menu__name">{row.label}</span>
                                  {#if String(unit_category_id) === String(row.value)}
                                    <i class="ms" aria-hidden="true">check</i>
                                  {/if}
                                </button>
                              {/each}
                              {#if !filteredUnitCategoryOptions.length}
                                <span class="pf-menu__empty">{t('No results found')}</span>
                              {/if}
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  {#if type == 'service'}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-department">{t('Department')}</label>
                      </div>
                      <div class="pf-box pf-box--select">
                        <select id="pf-department" bind:value={department_id}>
                          <option value="">{t('Select Department')}</option>
                          {#each departments as row (row.id)}
                            <option value={row.id}>{row.name}</option>
                          {/each}
                        </select>
                        <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                      </div>
                    </div>

                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-user">{t('User')}</label>
                      </div>
                      <div class="pf-box pf-box--select">
                        <select id="pf-user" bind:value={user_id}>
                          <option value="">{t('Select User')}</option>
                          {#each users as row (row.id)}
                            <option value={row.id}>
                              {`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username}
                            </option>
                          {/each}
                        </select>
                        <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                      </div>
                    </div>

                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-duration">{t('Service Duration')}</label>
                      </div>
                      <div class="pf-box">
                        <input
                          id="pf-duration"
                          type="text"
                          inputmode="numeric"
                          autocomplete="off"
                          bind:value={service_duration} />
                        <span class="pf-suffix">{t(service_duration_unit)}</span>
                      </div>
                    </div>

                    <div class="pf-f">
                      <div class="pf-label">
                        <span>{t('Select Time Unit')}</span>
                      </div>
                      <div class="pf-box pf-box--select">
                        <select bind:value={service_duration_unit}>
                          {#each time_units as row}
                            <option value={row}>{t(row)}</option>
                          {/each}
                        </select>
                        <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                      </div>
                    </div>
                  {/if}
                </div>
              </section>

              <section class="pf-card" aria-labelledby="pf-sec-pricing">
                <h3 id="pf-sec-pricing" class="pf-card__hd">
                  <i class="ms f" aria-hidden="true">payments</i>{t('Pricing & Stock')}
                </h3>

                <div class="pf-grid">
                  <div class="pf-f" data-pick="buycur">
                    <div class="pf-label">
                      <label for="pf-buy">
                        {type != 'service' ? t('Buy Price') : t('Cost Price')}{#if enable_require_buy_sell_price}<span
                            class="pf-req"
                            aria-hidden="true">*</span
                          >{/if}
                      </label>
                    </div>
                    <div class="pf-box pf-box--cur">
                      <input
                        id="pf-buy"
                        type="number"
                        inputmode="decimal"
                        autocomplete="off"
                        placeholder="0.00"
                        bind:value={buy_price}
                        on:input={() => {
                          if (enablePercent) {
                            sell_price = Number(
                              (parseFloat(buy_price) || 0) +
                                ((parseFloat(buy_price) || 0) * (parseFloat(percentage) || 0)) / 100,
                            ).toFixed(3);
                          }
                        }} />
                      <div class="pf-cur">
                        <button
                          type="button"
                          class="pf-cur__btn"
                          aria-haspopup="listbox"
                          aria-label={t('Currency')}
                          aria-expanded={openBuyCurrencyMenu}
                          title={pageBuyCurrency}
                          on:click={() => {
                            buyCurrencySearch = '';
                            openBuyCurrencyMenu = !openBuyCurrencyMenu;
                          }}>
                          <span dir="ltr">{pageBuySymbol}</span>
                          <i class="ms" aria-hidden="true">expand_more</i>
                        </button>
                        {#if openBuyCurrencyMenu}
                          <div class="pf-cumenu" role="dialog" aria-label={t('Currency')}>
                            <label class="pf-cumenu__search">
                              <i class="ms" aria-hidden="true">search</i>
                              <input
                                type="search"
                                autocomplete="off"
                                placeholder={t('Search')}
                                aria-label={t('Search')}
                                bind:value={buyCurrencySearch} />
                            </label>
                            <div class="pf-cumenu__list" role="listbox" aria-label={t('Currency')}>
                              {#each filteredBuyCurrencies as row (row.code)}
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={pageBuyCurrency === row.code}
                                  class="pf-cumenu__opt"
                                  class:is-on={pageBuyCurrency === row.code}
                                  class:is-base={row.isDefault == 1}
                                  on:click={() => {
                                    buy_currency = row.code;
                                    if (enablePercent) sell_currency = row.code;
                                    openBuyCurrencyMenu = false;
                                  }}>
                                  <span class="pf-cumenu__chip" dir="ltr"
                                    >{row.symbol || row.code}</span
                                  >
                                  <span class="pf-cumenu__cpy">
                                    <span class="pf-cumenu__name">{t(row.code)}</span>
                                    {#if pageCurrencyRate(row)}
                                      <span class="pf-cumenu__rate" dir="ltr"
                                        >{pageCurrencyRate(row)}</span
                                      >
                                    {/if}
                                  </span>
                                  <span class="pf-cumenu__code" dir="ltr">{row.code}</span>
                                  <i class="ms pf-cumenu__check" aria-hidden="true">check</i>
                                </button>
                              {/each}
                              {#if !filteredBuyCurrencies.length}
                                <span class="pf-menu__empty">{t('No results found')}</span>
                              {/if}
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <div class="pf-f" data-pick="sellcur">
                    <div class="pf-label">
                      <label for="pf-sell">
                        {t('Sell Price')}{#if enable_require_buy_sell_price}<span class="pf-req" aria-hidden="true"
                            >*</span
                          >{/if}
                      </label>
                    </div>
                    <div class="pf-box pf-box--cur">
                      {#if enablePercent}
                        <input
                          id="pf-sell"
                          type="number"
                          inputmode="decimal"
                          autocomplete="off"
                          placeholder="0"
                          value={percentage}
                          on:input={(event) => {
                            percentage = event.currentTarget.value;
                            sell_price = (
                              (parseFloat(buy_price) || 0) *
                              (1 + (parseFloat(percentage) || 0) / 100)
                            ).toFixed(3);
                          }} />
                      {:else}
                        <input
                          id="pf-sell"
                          type="number"
                          inputmode="decimal"
                          autocomplete="off"
                          placeholder="0.00"
                          bind:value={sell_price}
                          on:blur={() => {
                            if (sell_currency == buy_currency && +sell_price < +buy_price) {
                              sell_price = buy_price;
                            }
                          }} />
                      {/if}

                      {#if pageSellHint}
                        <span
                          class="pf-hint"
                          class:is-neg={pageMarkup < 0}
                          dir="ltr"
                          aria-hidden="true">{pageSellHint}</span>
                      {/if}

                      <span class="pf-seg" role="group" aria-label={t('Sell Price')}>
                        <button
                          type="button"
                          class:is-on={enablePercent}
                          title={t('Percent')}
                          on:click={() => {
                            openSellCurrencyMenu = false;
                            setPercentMode(true);
                          }}>٪</button>
                        <button
                          type="button"
                          class="pf-seg__pick"
                          class:is-on={!enablePercent}
                          aria-haspopup="listbox"
                          aria-label={t('Currency')}
                          aria-expanded={openSellCurrencyMenu}
                          title={pageSellCurrency}
                          on:click={() => {
                            if (enablePercent) {
                              setPercentMode(false);
                              return;
                            }
                            sellCurrencySearch = '';
                            openSellCurrencyMenu = !openSellCurrencyMenu;
                          }}>
                          <span dir="ltr">{pageSellSymbol}</span>
                          <i class="ms" aria-hidden="true">expand_more</i>
                        </button>
                      </span>

                      {#if openSellCurrencyMenu}
                        <div class="pf-cumenu" role="dialog" aria-label={t('Currency')}>
                          <label class="pf-cumenu__search">
                            <i class="ms" aria-hidden="true">search</i>
                            <input
                              type="search"
                              autocomplete="off"
                              placeholder={t('Search')}
                              aria-label={t('Search')}
                              bind:value={sellCurrencySearch} />
                          </label>
                          <div class="pf-cumenu__list" role="listbox" aria-label={t('Currency')}>
                            {#each filteredSellCurrencies as row (row.code)}
                              <button
                                type="button"
                                role="option"
                                aria-selected={pageSellCurrency === row.code}
                                class="pf-cumenu__opt"
                                class:is-on={pageSellCurrency === row.code}
                                class:is-base={row.isDefault == 1}
                                on:click={() => {
                                  if (!enablePercent) sell_currency = row.code;
                                  openSellCurrencyMenu = false;
                                }}>
                                <span class="pf-cumenu__chip" dir="ltr">{row.symbol || row.code}</span>
                                <span class="pf-cumenu__cpy">
                                  <span class="pf-cumenu__name">{t(row.code)}</span>
                                  {#if pageCurrencyRate(row)}
                                    <span class="pf-cumenu__rate" dir="ltr"
                                      >{pageCurrencyRate(row)}</span
                                    >
                                  {/if}
                                </span>
                                <span class="pf-cumenu__code" dir="ltr">{row.code}</span>
                                <i class="ms pf-cumenu__check" aria-hidden="true">check</i>
                              </button>
                            {/each}
                            {#if !filteredSellCurrencies.length}
                              <span class="pf-menu__empty">{t('No results found')}</span>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>

                  {#if (type == 'product' || type == 'sale') && (!editingId || oldProductinitial_warehouse_id == 0)}
                    <div class="pf-f" data-pick="wh">
                      <div class="pf-label">
                        <span id="pf-l-wh">{t('Warehouse')}</span>
                      </div>
                      <div class="pf-pick">
                        <button
                          type="button"
                          class="pf-box pf-box--btn"
                          aria-labelledby="pf-l-wh"
                          aria-haspopup="listbox"
                          aria-expanded={openWarehouseMenu}
                          on:click={() => (openWarehouseMenu = !openWarehouseMenu)}>
                          <span class="pf-pick__t" class:is-empty={!pageWarehouseName}>
                            {pageWarehouseName || t('Select Warehouse')}
                          </span>
                          <i class="ms pf-pick__caret" aria-hidden="true">expand_more</i>
                        </button>

                        {#if openWarehouseMenu}
                          <div class="pf-menu" role="listbox" aria-labelledby="pf-l-wh">
                            <div class="pf-menu__list">
                              {#each warehouses as row (row.id)}
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={String(selectedWarehouseId ?? '') === String(row.id)}
                                  class="pf-menu__opt"
                                  class:is-on={String(selectedWarehouseId ?? '') === String(row.id)}
                                  on:click={() => {
                                    selectedWarehouseId = row.id;
                                    openWarehouseMenu = false;
                                  }}>
                                  <span class="pf-menu__name">{row.name}</span>
                                  {#if String(selectedWarehouseId ?? '') === String(row.id)}
                                    <i class="ms" aria-hidden="true">check</i>
                                  {/if}
                                </button>
                              {/each}
                              {#if !warehouses.length}
                                <span class="pf-menu__empty">{t('No results found')}</span>
                              {/if}
                            </div>
                            {#if selectedWarehouseId}
                              <button
                                type="button"
                                class="pf-menu__clear"
                                on:click={() => {
                                  selectedWarehouseId = '';
                                  openWarehouseMenu = false;
                                }}>
                                <i class="ms" aria-hidden="true">backspace</i>{t('Clear selection')}
                              </button>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>

                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-stock-qty">{t('Warehouse Quantity')}</label>
                      </div>
                      <div class="pf-box">
                        <input
                          id="pf-stock-qty"
                          type="number"
                          inputmode="decimal"
                          autocomplete="off"
                          bind:value={warehouseQuantity} />
                        <span class="pf-suffix">{pageUnitWord}</span>
                      </div>
                    </div>
                  {/if}

                  {#if enable_batch}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-batch">{t('Batch')}</label>
                      </div>
                      <div class="pf-box">
                        <input id="pf-batch" type="text" autocomplete="off" bind:value={batch} />
                      </div>
                    </div>
                  {/if}

                  {#if enable_manufacturing_date}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="c-manufacturing_date">{t('Manufacturing Date')}</label>
                      </div>
                      <div class="pf-box persianDatePicker product-date-picker">
                        <input
                          type="date"
                          id="c-manufacturing_date"
                          data-bind="manufacturing_date"
                          bind:value={manufacturing_date} />
                      </div>
                    </div>
                  {/if}

                  {#if enable_expiry_date}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="c-expiry_date">{t('Expiry Date')}</label>
                      </div>
                      <div class="pf-box persianDatePicker product-date-picker">
                        <input
                          type="date"
                          id="c-expiry_date"
                          data-bind="expiry_date"
                          bind:value={expiry_date} />
                      </div>
                    </div>
                  {/if}

                  {#if type != 'service' && enable_expiry_date}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-alarm-days">{t('Alarm Expiry Days')}</label>
                      </div>
                      <div class="pf-box">
                        <input
                          id="pf-alarm-days"
                          type="number"
                          min="0"
                          inputmode="numeric"
                          autocomplete="off"
                          bind:value={alarm_expiry_days} />
                      </div>
                    </div>
                  {/if}
                </div>
              </section>

              <section class="pf-card" aria-labelledby="pf-sec-extra">
                <h3 id="pf-sec-extra" class="pf-card__hd">
                  <i class="ms f" aria-hidden="true">notes</i>{t('Extra Information')}
                </h3>

                <div class="pf-grid">
                  {#if type != 'service' && _translate_org_type != 'exchange'}
                    <div class="pf-f">
                      <div class="pf-label">
                        <label for="pf-alarm">{t('Alarm Quantity')}</label>
                      </div>
                      <div class="pf-box">
                        <input
                          id="pf-alarm"
                          type="text"
                          inputmode="numeric"
                          autocomplete="off"
                          bind:value={alarm_quantity} />
                        <span class="pf-suffix">{pageUnitWord}</span>
                      </div>
                    </div>
                  {/if}

                  <div class="pf-f pf-f--2">
                    <div class="pf-label">
                      <label for="pf-description">{t('Description')}</label>
                    </div>
                    <textarea
                      id="pf-description"
                      class="pf-textarea"
                      rows="1"
                      maxlength="1000"
                      placeholder={t('Description')}
                      bind:value={description}></textarea>
                  </div>

                  <div class="pf-f">
                    <div class="pf-label">
                      <span>{t('Image')}</span>
                      <button
                        type="button"
                        class="pf-mini pf-mini--image"
                        title={t('Search Image')}
                        disabled={!name?.trim()}
                        on:click={searchImageOnGoogle}>
                        <i class="ms" aria-hidden="true">image_search</i>{t('Search Image')}
                      </button>
                    </div>

                    {#if modalImageUrl}
                      <div class="pf-image">
                        <img src={modalImageUrl} alt={t('Image')} />
                        <span class="pf-image__name">{t('Select Image')}</span>
                        <label class="pf-image__swap" title={t('Select Image')}>
                          <input
                            class="pf-sr"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/*"
                            on:change={handleImageUpload} />
                          <i class="ms" aria-hidden="true">sync</i>
                        </label>
                        <button
                          type="button"
                          class="pf-image__del"
                          title={t('Clear')}
                          aria-label={t('Clear')}
                          on:click={() => {
                            modalImageUrl = null;
                            imageBase64 = null;
                            thumbnailBase64 = null;
                          }}>
                          <i class="ms" aria-hidden="true">delete</i>
                        </button>
                      </div>
                    {:else}
                      <label
                        class="pf-drop"
                        on:paste={(event) => handlePasteImage(event)}
                        on:dragover={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = 'copy';
                        }}
                        on:dragenter={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        on:drop={(event) => handleDropImage(event)}>
                        <input
                          class="pf-sr"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/*"
                          on:change={handleImageUpload} />
                        <i class="ms" aria-hidden="true">add_photo_alternate</i>{t('Select Image')}
                      </label>
                    {/if}
                  </div>
                </div>
              </section>
            </div>

            <aside class="pf-side" aria-label={t('Registration Summary')}>
              <div class="pf-side__hd">
                <h3>{t('Registration Summary')}</h3>
                <span class="pf-state" class:pf-state--ok={pageComplete}>
                  <i class="ms f" aria-hidden="true">{pageComplete ? 'check_circle' : 'pending'}</i>
                  {pageComplete ? t('Complete') : t('Incomplete')}
                </span>
              </div>
              <span class="pf-progress" aria-hidden="true"
                ><span style={`width: ${pageProgressWidth}`}></span></span
              >

              <div class="pf-prev">
                <div class="pf-prev__body">
                  <strong class="pf-prev__name" class:is-empty={!name}>{name || t('Name')}</strong>
                  <span class="pf-prev__chips">
                    <span class="pf-chip pf-chip--code" dir="ltr">{code || '—'}</span>
                    <span class="pf-chip">{pageCategoryName || t('Category')}</span>
                  </span>
                </div>
              </div>

              <div class="pf-side__money">
                <div class="pf-side__prices">
                  <div>
                    <span>{t('Buy Price')}</span>
                    <b dir="ltr">{pageBuyText} <em>{pageBuySymbol}</em></b>
                  </div>
                  <div>
                    <span>{t('Sell Price')}</span>
                    <b dir="ltr">{pageSellText} <em>{pageSellSymbol}</em></b>
                  </div>
                </div>
                <span class="pf-side__bar" aria-hidden="true">
                  <span
                    class="pf-side__fill"
                    class:is-neg={!pageMarginPositive}
                    style={`width: ${pageMarginWidth}`}></span>
                </span>
                <div class="pf-side__profit">
                  <span
                    >{t('Profit')}
                    <b dir="ltr">{pageProfitSign}{pageProfitText}</b></span
                  >
                  <span class="pf-side__margin" class:is-neg={!pageMarginPositive} dir="ltr">
                    {pageMarginText}
                  </span>
                </div>
              </div>

              <dl class="pf-side__facts">
                <dt>{t('Unit')}</dt>
                <dd>{pageUnitWord}</dd>
                {#if type == 'service'}
                  <dt>{t('Department')}</dt>
                  <dd>{pageDepartmentName || '—'}</dd>
                  <dt>{t('User')}</dt>
                  <dd>{pageUserName || '—'}</dd>
                {:else}
                  {#if enable_brands}
                    <dt>{t('Brand')}</dt>
                    <dd>{pageBrandName || '—'}</dd>
                  {/if}
                  {#if enable_generics}
                    <dt>{t('Generic')}</dt>
                    <dd>{pageGenericName || '—'}</dd>
                  {/if}
                {/if}
              </dl>

              <div class="pf-side__stock">
                <div class="pf-side__wh">
                  <i class="ms" aria-hidden="true">warehouse</i>
                  <span>{pageWarehouseName || t('Select Warehouse')}</span>
                </div>
                <div class="pf-side__stockrow">
                  <b>{pageStockText} <em>{pageUnitWord}</em></b>
                  <span dir="ltr">{pageStockValueText} {pageBuySymbol}</span>
                </div>
                {#if type != 'service'}
                  <div class="pf-side__foot">
                    <span
                      ><i class="ms" aria-hidden="true">notifications</i>{t('Alarm Quantity')}:
                      <b dir="ltr">{alarm_quantity || '—'}</b></span
                    >
                    {#if enable_expiry_date}
                      <span
                        >{t('Alarm Expiry Days')}:
                        <b dir="ltr">{alarm_expiry_days || '—'}</b></span
                      >
                    {/if}
                  </div>
                {/if}
              </div>
            </aside>
          </div>

          <div class="pf-bar">
            <button
              type="button"
              class="pf-btn pf-btn--ghost pf-bar__cancel"
              on:click={closeProductForm}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              class="pf-btn pf-btn--outline"
              disabled={editingId && !nextProductId && !previousProductId}
              title="Ctrl+Enter"
              on:click={() => saveProduct(editingId ? 'edit-another' : 'again')}>
              {#if editingId}
                {type == 'service' ? 'ویرایش خدمت و ویرایش خدمت دیگر' : 'ویرایش محصول و ویرایش محصول دیگر'}
              {:else}
                {t(type == 'service' ? 'Save Service and Add Another' : 'Save Product and Add Another')}
              {/if}
            </button>
            <button
              type="button"
              class="pf-btn pf-btn--primary"
              title="Ctrl+S"
              on:click={() => saveProduct()}>
              <i class="ms" aria-hidden="true">check</i>
              {editingId
                ? t(type == 'service' ? 'Update Service' : 'Update Product')
                : t(type == 'service' ? 'Save Service' : 'Save Product')}
            </button>
          </div>
        </div>
        {:else}
        <div class="mb-4 d-flex align-items-center d-none">
          <button class="btn btn-success me-2" on:click={() => loadFromData(myDataIndex)}>Load</button>
          <div class="input-group me-2">
            <button class="btn btn-danger" on:click={() => loadFromData(myDataIndex - 1)}>Prev</button>
            <div class="input-group-text">
              {myDataIndex}
            </div>
            <button class="btn btn-success" on:click={() => loadFromData(myDataIndex + 1)}>Next</button>
          </div>
          <button class="btn btn-success" on:click={() => addFromdata()}>Add</button>
        </div>
        <div class="product-page-form" class:product-page-form-layout={asPage}>
          <section class="form-card form-card-basic">
            <h3 class="form-card__title section-title">{t('Basic Information')}</h3>
            <div class="form-grid product-form-grid">
          <div class="field col-md-{type == 'service' ? 7 : 12} mb-2 product-span-2 product-main-row product-name-field">
            {#if asPage}
              <label class="field-label" for="c-name">
                {t('Name')}<span class="field-required" aria-hidden="true">*</span>
              </label>
              <div class="input-with-icon">
                <i class="bi bi-box-seam input-with-icon__icon" aria-hidden="true"></i>
                <input type="text" id="c-name" class="input" bind:value={name} />
              </div>
            {:else}
            <div class="input-group input-group-sm">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" id="c-name" class="form-control form-control-sm" bind:value={name} />
                <label class="form-label" for="c-name">{t('Name')}</label>
              </div>
              {#if _translate_org_type == 'exchange'}
                <button
                  id="currencyDropdown"
                  class="btn btn-secondary dropdown-toggle btn-sm pt-1 {_translate_org_type != 'exchange'
                    ? 'd-none'
                    : ''}"
                  type="button"
                  data-mdb-toggle="dropdown"
                  aria-expanded="false">
                  {currency ? t(currency) : t('Currency')}
                </button>
                <ul class="dropdown-menu dropdown-menu-end {_translate_org_type != 'exchange' ? 'd-none' : ''}">
                  {#each currencies as cur}
                    <li>
                      <button
                        class="dropdown-item"
                        style={currency == cur.code
                          ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                          : ''}
                        on:click={() => {
                          currency = cur.code;
                          generateNameForExchange();
                        }}
                        type="button">
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            {/if}
          </div>
          {#if type == 'service'}
            <div class="col-md-5 mb-3">
              <div class="input-group input-group-sm">
                <div class="form-outline flex-grow-1" data-mdb-input-init>
                  <input
                    type="text"
                    id="inp_setup_time"
                    class="form-control form-control-sm"
                    bind:value={service_duration} />
                  <label class="form-label" for="inp_setup_time">{t('Service Duration')}</label>
                </div>
                <button
                  id="showCategoryDropdown"
                  class="btn btn-info btn-sm dropdown-toggle p-2"
                  type="button"
                  data-mdb-toggle="dropdown"
                  aria-expanded="false">
                  {service_duration_unit
                    ? t(time_units.find((c) => c == service_duration_unit))
                    : t('Select Time Unit')}
                </button>
                <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                  {#each time_units as tu}
                    <li>
                      <button
                        class="dropdown-item {service_duration_unit == tu ? 'bg-info text-white' : ''}"
                        on:click={() => (service_duration_unit = tu)}
                        type="button">
                        {t(tu)}
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          {/if}
          <div class="field col-md-6 mb-3 product-span-2 product-main-row">
            {#if asPage}
              <label class="field-label">
                {t('Select Category')}<span class="field-required" aria-hidden="true">*</span>
              </label>
            {/if}
            <div class="position-relative">
              {#if category_id && asPage}
                <div class="input-action-control">
                  <div class="input-action-control__input input-action-control__input--selected">
                    {categories.find((c) => c.id == category_id)?.name || t('Select Category')}
                  </div>
                  <button
                    type="button"
                    class="input-action-control__btn"
                    title={t('Select Category')}
                    aria-label={t('Select Category')}
                    on:click={async () => {
                      category_id = '';
                      category_search = '';
                      showCategoryDropdown = true;
                      filteredCategories = categories;

                      await tick();

                      form_category_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-chevron-down"></i>
                  </button>
                </div>
              {:else if category_id}
              <div class="input-group input-group-sm w-100">
                  <span class="input-group-text bg-info text-white fw-bold"><i class="bi bi-tag"></i> </span>
                  <span class="input-group-text badge-info w-100 fw-bold">
                    {t('Category')}: {categories.find((c) => c.id == category_id)
                      ? categories.find((c) => c.id == category_id)?.name
                      : t('Select Category')}
                  </span>
                  <button
                    class="btn btn-danger btn-sm pt-1"
                    on:click={async () => {
                      category_id = '';
                      category_search = '';
                      showCategoryDropdown = true;
                      filteredCategories = categories;

                      await tick(); // wait for DOM to update

                      form_category_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
              </div>
              {:else if asPage}
                <div class="input-action-control">
                  <input
                    type="text"
                    class="input-action-control__input"
                    id="form_category_search"
                    bind:this={form_category_search_input}
                    bind:value={category_search}
                    on:input={() => {
                      showCategoryDropdown = true;
                      filteredCategories = categories.filter((cat) => {
                        const name = cat.name;
                        return name && name.toLowerCase().includes(category_search.trim().toLowerCase());
                      });
                    }}
                    on:focus={() => {
                      showCategoryDropdown = true;
                      if (category_search.trim()) {
                        filteredCategories = categories.filter((cat) => {
                          const name = cat.name;
                          return name && name.toLowerCase().includes(category_search.trim().toLowerCase());
                        });
                      } else {
                        filteredCategories = categories;
                      }
                    }}
                    on:blur={() => setTimeout(() => (showCategoryDropdown = false), 150)}
                    autocomplete="off" />
                  <button
                    type="button"
                    class="input-action-control__btn input-action-control__btn--create"
                    title={t('Create Product Category')}
                    aria-label={t('Create Product Category')}
                    on:click={() => {
                      catModalRef.openProductCategoryModal();
                    }}>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                  </button>
                </div>
              {:else}
              <div class="input-group input-group-sm w-100">
                  <div class="field-quick-create-wrap w-100">
                    <div class="form-outline" data-mdb-input-init>
                      <input
                        type="text"
                        class="form-control form-control-sm field-quick-create-input"
                        id="form_category_search"
                        bind:this={form_category_search_input}
                        bind:value={category_search}
                        on:input={() => {
                          showCategoryDropdown = true;
                          filteredCategories = categories.filter((cat) => {
                            const name = cat.name;
                            return name && name.toLowerCase().includes(category_search.trim().toLowerCase());
                          });
                        }}
                        on:focus={() => {
                          showCategoryDropdown = true;
                          if (category_search.trim()) {
                            filteredCategories = categories.filter((cat) => {
                              const name = cat.name;
                              return name && name.toLowerCase().includes(category_search.trim().toLowerCase());
                            });
                          } else {
                            filteredCategories = categories;
                          }
                        }}
                        on:blur={() => setTimeout(() => (showCategoryDropdown = false), 150)}
                        autocomplete="off" />
                      <label class="form-label" for="form_category_search">{t('Select Category')}</label>
                    </div>
                    <button
                      type="button"
                      class="field-quick-create-btn"
                      title={t('Create Product Category')}
                      aria-label={t('Create Product Category')}
                      on:click={() => {
                        catModalRef.openProductCategoryModal();
                      }}>
                      <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                    </button>
                  </div>
              </div>
              {/if}
              {#if showCategoryDropdown && filteredCategories.length > 0}
                <ul class="list-group product-picker-menu position-absolute w-100 z-3">
                  {#each filteredCategories as cat}
                    <li
                      class="list-group-item list-group-item-action"
                      on:mousedown={() => {
                        category_id = cat.id;
                        category_search = '';
                        showCategoryDropdown = false;
                        setTimeout(() => {
                          if (window.mdb) {
                            initMdbInputs(document);
                          }
                        }, 100);
                      }}>
                      {cat.name}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>

          {#if unitCategories.length > 0}
          <div class="field col-md-6 mb-3 product-span-2 product-main-row">
            {#if asPage}
              <FilterSelect
                label={t('Unit Category')}
                value={unit_category_id ?? ''}
                options={unitCategoryOptions}
                on:change={(e) => selectUnitCategory(e.detail)} />
            {:else}
              <!--
                No data-mdb-input-init here: MDB auto-initializes that attribute
                and its Input class expects an input or textarea, so a select
                wrapper throws on load. The outline styles are applied by CSS.
              -->
              <div class="form-outline">
                <select
                  id="c-unit-category"
                  class="form-select form-select-sm"
                  bind:value={unit_category_id}
                  on:change={() => selectUnitCategory(unit_category_id)}>
                  <option value="">{t('All Units')}</option>
                  {#each unitCategories as category}
                    <option value={category.id}>{category.name}</option>
                  {/each}
                </select>
                <label class="form-label" for="c-unit-category">{t('Unit Category')}</label>
              </div>
            {/if}
          </div>
          {/if}

          <div class="field col-md-6 mb-3 product-span-2 product-main-row">
            {#if asPage}
              <label class="field-label">
                {t('Select Unit')}<span class="field-required" aria-hidden="true">*</span>
              </label>
            {/if}
            <div class="position-relative">
              {#if product_unit_id && asPage}
                <div class="input-action-control">
                  <div class="input-action-control__input input-action-control__input--selected">
                    {units.find((c) => c.id == product_unit_id)?.name || t('Select Unit')}
                  </div>
                  <button
                    type="button"
                    class="input-action-control__btn"
                    title={t('Select Unit')}
                    aria-label={t('Select Unit')}
                    on:click={async () => {
                      product_unit_id = '';
                      unit_search = '';
                      showUnitDropdown = true;
                      filteredUnits = listUnits('');
                      await tick();
                      form_unit_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-chevron-down"></i>
                  </button>
                </div>
              {:else if product_unit_id}
              <div class="input-group input-group-sm w-100">
                  <span class="input-group-text bg-primary text-white fw-bold"><i class="bi bi-box"></i> </span>
                  <span class="input-group-text badge-primary w-100 fw-bold">
                    {t('Unit')}: {units.find((c) => c.id == product_unit_id)
                      ? units.find((c) => c.id == product_unit_id)?.name
                      : t('Select Unit')}
                  </span>
                  <button
                    class="btn btn-danger btn-sm pt-1"
                    on:click={async () => {
                      product_unit_id = '';
                      unit_search = '';
                      showUnitDropdown = true;
                      filteredUnits = listUnits('');
                      await tick();
                      form_unit_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
              </div>
              {:else if asPage}
                <div class="input-action-control">
                  <input
                    type="text"
                    class="input-action-control__input"
                    id="form_unit_search"
                    bind:this={form_unit_search_input}
                    bind:value={unit_search}
                    on:input={() => {
                      showUnitDropdown = true;
                      filteredUnits = listUnits();
                    }}
                    on:focus={() => {
                      showUnitDropdown = true;
                      filteredUnits = listUnits();
                    }}
                    on:blur={() => setTimeout(() => (showUnitDropdown = false), 150)}
                    autocomplete="off" />
                  <button
                    type="button"
                    class="input-action-control__btn input-action-control__btn--create"
                    title={t('Create Unit')}
                    aria-label={t('Create Unit')}
                    on:click={() => {
                      unitModalRef.openUnitModal();
                    }}>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                  </button>
                </div>
              {:else}
              <div class="input-group input-group-sm w-100">
                  <div class="field-quick-create-wrap w-100">
                    <div class="form-outline" data-mdb-input-init>
                      <input
                        type="text"
                        class="form-control form-control-sm field-quick-create-input"
                        id="form_unit_search"
                        bind:this={form_unit_search_input}
                        bind:value={unit_search}
                        on:input={() => {
                          showUnitDropdown = true;
                          filteredUnits = listUnits();
                        }}
                        on:focus={() => {
                          showUnitDropdown = true;
                          filteredUnits = listUnits();
                        }}
                        on:blur={() => setTimeout(() => (showUnitDropdown = false), 150)}
                        autocomplete="off" />
                      <label class="form-label" for="form_unit_search">{t('Select Unit')}</label>
                    </div>
                    <button
                      type="button"
                      class="field-quick-create-btn"
                      title={t('Create Unit')}
                      aria-label={t('Create Unit')}
                      on:click={() => {
                        unitModalRef.openUnitModal();
                      }}>
                      <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                    </button>
                  </div>
              </div>
              {/if}
              {#if showUnitDropdown && filteredUnits.length > 0}
                <ul class="list-group product-picker-menu position-absolute w-100 z-3">
                  {#each filteredUnits as unit}
                    <li
                      class="list-group-item list-group-item-action"
                      on:mousedown={() => {
                        product_unit_id = unit.id;
                        unit_search = '';
                        showUnitDropdown = false;
                        setTimeout(() => {
                          if (window.mdb) {
                            initMdbInputs(document);
                          }
                        }, 100);
                      }}>
                      {unit.name}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>

          {#if type == 'service'}
            <div class="field col-md-6 mb-3 product-span-2 product-main-row">
              {#if asPage}
                <label class="field-label">{t('Select Department')}</label>
              {/if}
              <div class="position-relative">
                {#if department_id && asPage}
                  <div class="input-action-control">
                    <div class="input-action-control__input input-action-control__input--selected">
                      {departments.find((c) => c.id == department_id)?.name || t('Select Department')}
                    </div>
                    <button
                      type="button"
                      class="input-action-control__btn"
                      title={t('Select Department')}
                      aria-label={t('Select Department')}
                      on:click={async () => {
                        department_id = '';
                        department_search = '';
                        showDepartmentDropdown = true;
                        filteredDepartments = departments;
                        await tick();
                        form_department_search_input?.focus();
                        if (window.mdb) {
                          initMdbInputs();
                        }
                      }}>
                      <i class="bi bi-chevron-down"></i>
                    </button>
                  </div>
                {:else if department_id}
                <div class="input-group input-group-sm w-100">
                  <span class="input-group-text bg-primary text-white fw-bold"><i class="bi bi-building"></i> </span>
                  <span class="input-group-text badge-primary w-100 fw-bold">
                    {t('Department')}: {departments.find((c) => c.id == department_id)
                      ? departments.find((c) => c.id == department_id)?.name
                      : t('Select Department')}
                  </span>
                  <button
                    class="btn btn-danger btn-sm pt-1"
                    on:click={async () => {
                      department_id = '';
                      department_search = '';
                      showDepartmentDropdown = true;
                      filteredDepartments = departments;
                      await tick();
                      form_department_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
                </div>
                {:else if asPage}
                  <div class="input-action-control">
                    <input
                      type="text"
                      class="input-action-control__input"
                      id="form_department_search"
                      bind:this={form_department_search_input}
                      bind:value={department_search}
                      placeholder={t('Select Department')}
                      on:input={() => {
                        showDepartmentDropdown = true;
                        filteredDepartments = departments.filter((department) => {
                          const name = department.name;
                          return name && name.toLowerCase().includes(department_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showDepartmentDropdown = true;
                        if (department_search.trim()) {
                          filteredDepartments = departments.filter((department) => {
                            const name = department.name;
                            return name && name.toLowerCase().includes(department_search.trim().toLowerCase());
                          });
                        } else {
                          filteredDepartments = departments;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showDepartmentDropdown = false), 150)}
                      autocomplete="off" />
                  </div>
                {:else}
                  <div class="form-outline" data-mdb-input-init>
                    <input
                      type="text"
                      class="form-control form-control-sm"
                      id="form_department_search"
                      bind:this={form_department_search_input}
                      bind:value={department_search}
                      on:input={() => {
                        showDepartmentDropdown = true;
                        filteredDepartments = departments.filter((department) => {
                          const name = department.name;
                          return name && name.toLowerCase().includes(department_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showDepartmentDropdown = true;
                        if (department_search.trim()) {
                          filteredDepartments = departments.filter((department) => {
                            const name = department.name;
                            return name && name.toLowerCase().includes(department_search.trim().toLowerCase());
                          });
                        } else {
                          filteredDepartments = departments;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showDepartmentDropdown = false), 150)}
                      autocomplete="off" />
                    <label class="form-label" for="form_department_search">{t('Select Department')}</label>
                  </div>
                {/if}
                {#if showDepartmentDropdown && filteredDepartments.length > 0}
                  <ul class="list-group product-picker-menu position-absolute w-100 z-3">
                    {#each filteredDepartments as department}
                      <li
                        class="list-group-item list-group-item-action"
                        on:mousedown={() => {
                          department_id = department.id;
                          department_search = '';
                          showDepartmentDropdown = false;
                          setTimeout(() => {
                            if (window.mdb) {
                              initMdbInputs(document);
                            }
                          }, 100);
                        }}>
                        {department.name}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
            <div class="field col-md-6 mb-3 product-span-2 product-main-row">
              {#if asPage}
                <label class="field-label">{t('Select User')}</label>
              {/if}
              <div class="position-relative">
                {#if user_id && asPage}
                  <div class="input-action-control">
                    <div class="input-action-control__input input-action-control__input--selected">
                      {users.find((c) => c.id == user_id)
                        ? `${users.find((c) => c.id == user_id)?.first_name || ''} ${users.find((c) => c.id == user_id)?.last_name || ''} (${users.find((c) => c.id == user_id)?.username})`
                        : t('Select User')}
                    </div>
                    <button
                      type="button"
                      class="input-action-control__btn"
                      title={t('Select User')}
                      aria-label={t('Select User')}
                      on:click={async () => {
                        user_id = '';
                        user_search = '';
                        showUserDropdown = true;
                        filteredUsers = users;
                        await tick();
                        form_user_search_input?.focus();
                        if (window.mdb) {
                          initMdbInputs();
                        }
                      }}>
                      <i class="bi bi-chevron-down"></i>
                    </button>
                  </div>
                {:else if user_id}
                <div class="input-group input-group-sm w-100">
                  <span class="input-group-text bg-primary text-white fw-bold"><i class="bi bi-person"></i> </span>
                  <span class="input-group-text badge-primary w-100 fw-bold">
                    {t('User')}: {users.find((c) => c.id == user_id)
                      ? `${users.find((c) => c.id == user_id)?.first_name || ''} ${users.find((c) => c.id == user_id)?.last_name || ''} (${users.find((c) => c.id == user_id)?.username})`
                      : t('Select User')}
                  </span>
                  <button
                    class="btn btn-danger btn-sm pt-1"
                    on:click={async () => {
                      user_id = '';
                      user_search = '';
                      showUserDropdown = true;
                      filteredUsers = users;
                      await tick();
                      form_user_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
                </div>
                {:else if asPage}
                  <div class="input-action-control">
                    <input
                      type="text"
                      class="input-action-control__input"
                      id="form_user_search"
                      bind:this={form_user_search_input}
                      bind:value={user_search}
                      placeholder={t('Select User')}
                      on:input={() => {
                        showUserDropdown = true;
                        filteredUsers = users.filter((user) => {
                          const name = `${user.first_name} ${user.last_name} (${user.username})`;
                          return name && name.toLowerCase().includes(user_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showUserDropdown = true;
                        if (user_search.trim()) {
                          filteredUsers = users.filter((user) => {
                            const name = `${user.first_name} ${user.last_name} (${user.username})`;
                            return name && name.toLowerCase().includes(user_search.trim().toLowerCase());
                          });
                        } else {
                          filteredUsers = users;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showUserDropdown = false), 150)}
                      autocomplete="off" />
                  </div>
                {:else}
                  <div class="form-outline" data-mdb-input-init>
                    <input
                      type="text"
                      class="form-control form-control-sm"
                      id="form_user_search"
                      bind:this={form_user_search_input}
                      bind:value={user_search}
                      on:input={() => {
                        showUserDropdown = true;
                        filteredUsers = users.filter((user) => {
                          const name = `${user.first_name} ${user.last_name} (${user.username})`;
                          return name && name.toLowerCase().includes(user_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showUserDropdown = true;
                        if (user_search.trim()) {
                          filteredUsers = users.filter((user) => {
                            const name = `${user.first_name} ${user.last_name} (${user.username})`;
                            return name && name.toLowerCase().includes(user_search.trim().toLowerCase());
                          });
                        } else {
                          filteredUsers = users;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showUserDropdown = false), 150)}
                      autocomplete="off" />
                    <label class="form-label" for="form_user_search">{t('Select User')}</label>
                  </div>
                {/if}
                {#if showUserDropdown && filteredUsers.length > 0}
                  <ul class="list-group product-picker-menu position-absolute w-100 z-3">
                    {#each filteredUsers as user}
                      <li
                        class="list-group-item list-group-item-action"
                        on:mousedown={() => {
                          user_id = user.id;
                          user_search = '';
                          showUserDropdown = false;
                          setTimeout(() => {
                            if (window.mdb) {
                              initMdbInputs(document);
                            }
                          }, 100);
                        }}>
                        {user.first_name}
                        {user.last_name} ({user.username})
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          {/if}
          {#if enable_brands && type != 'service'}
            <div class="field col-md-6 mb-3 product-span-2 product-main-row">
              {#if asPage}
                <label class="field-label">{t('Select Brand')}</label>
              {/if}
              <div class="position-relative">
                {#if brand_id && asPage}
                  <div class="input-action-control">
                    <div class="input-action-control__input input-action-control__input--selected">
                      {brands.find((c) => c.id == brand_id)?.name || t('Select Brand')}
                    </div>
                    <button
                      type="button"
                      class="input-action-control__btn"
                      title={t('Select Brand')}
                      aria-label={t('Select Brand')}
                      on:click={async () => {
                        brand_id = '';
                        brand_search = '';
                        showBrandDropdown = true;
                        filteredBrands = brands;
                        await tick();
                        form_brand_search_input?.focus();
                        if (window.mdb) {
                          initMdbInputs();
                        }
                      }}>
                      <i class="bi bi-chevron-down"></i>
                    </button>
                  </div>
                {:else if brand_id}
                <div class="input-group input-group-sm w-100">
                  <span class="input-group-text bg-secondary text-white fw-bold"><i class="bi bi-award"></i> </span>
                  <span class="input-group-text badge-secondary w-100 fw-bold">
                    {t('Brand')}: {brands.find((c) => c.id == brand_id)
                      ? brands.find((c) => c.id == brand_id)?.name
                      : t('Select Brand')}
                  </span>
                  <button
                    class="btn btn-danger btn-sm pt-1"
                    on:click={async () => {
                      brand_id = '';
                      brand_search = '';
                      showBrandDropdown = true;
                      filteredBrands = brands;
                      await tick();
                      form_brand_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
                </div>
                {:else if asPage}
                  <div class="input-action-control">
                    <input
                      type="text"
                      class="input-action-control__input"
                      id="form_brand_search"
                      bind:this={form_brand_search_input}
                      bind:value={brand_search}
                      placeholder={t('Select Brand')}
                      on:input={() => {
                        showBrandDropdown = true;
                        filteredBrands = brands.filter((brand) => {
                          const name = brand.name;
                          return name && name.toLowerCase().includes(brand_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showBrandDropdown = true;
                        if (brand_search.trim()) {
                          filteredBrands = brands.filter((brand) => {
                            const name = brand.name;
                            return name && name.toLowerCase().includes(brand_search.trim().toLowerCase());
                          });
                        } else {
                          filteredBrands = brands;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showBrandDropdown = false), 150)}
                      autocomplete="off" />
                    <button
                      type="button"
                      class="input-action-control__btn input-action-control__btn--create"
                      title={t('Create Product Brand')}
                      aria-label={t('Create Product Brand')}
                      on:click={() => {
                        brandModalRef.openProductBrandModal();
                      }}>
                      <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                    </button>
                  </div>
                {:else}
                  <div class="field-quick-create-wrap w-100">
                    <div class="form-outline" data-mdb-input-init>
                      <input
                        type="text"
                        class="form-control form-control-sm field-quick-create-input"
                        id="form_brand_search"
                        bind:this={form_brand_search_input}
                        bind:value={brand_search}
                        on:input={() => {
                          showBrandDropdown = true;
                          filteredBrands = brands.filter((brand) => {
                            const name = brand.name;
                            return name && name.toLowerCase().includes(brand_search.trim().toLowerCase());
                          });
                        }}
                        on:focus={() => {
                          showBrandDropdown = true;
                          if (brand_search.trim()) {
                            filteredBrands = brands.filter((brand) => {
                              const name = brand.name;
                              return name && name.toLowerCase().includes(brand_search.trim().toLowerCase());
                            });
                          } else {
                            filteredBrands = brands;
                          }
                        }}
                        on:blur={() => setTimeout(() => (showBrandDropdown = false), 150)}
                        autocomplete="off" />
                      <label class="form-label" for="form_brand_search">{t('Select Brand')}</label>
                    </div>
                    <button
                      type="button"
                      class="field-quick-create-btn"
                      title={t('Create Product Brand')}
                      aria-label={t('Create Product Brand')}
                      on:click={() => {
                        brandModalRef.openProductBrandModal();
                      }}>
                      <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                    </button>
                  </div>
                {/if}
                {#if showBrandDropdown && filteredBrands.length > 0}
                  <ul class="list-group product-picker-menu position-absolute w-100 z-3">
                    {#each filteredBrands as brand}
                      <li
                        class="list-group-item list-group-item-action"
                        on:mousedown={() => {
                          brand_id = brand.id;
                          brand_search = '';
                          showBrandDropdown = false;
                          setTimeout(() => {
                            if (window.mdb) {
                              initMdbInputs(document);
                            }
                          }, 100);
                        }}>
                        {brand.name}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          {/if}
          {#if enable_generics && type != 'service'}
            <div class="field col-md-6 mb-3 product-span-2 product-main-row">
              {#if asPage}
                <label class="field-label">{t('Select Generic')}</label>
              {/if}
              <div class="position-relative">
                {#if generic_id && asPage}
                  <div class="input-action-control">
                    <div class="input-action-control__input input-action-control__input--selected">
                      {generics.find((c) => c.id == generic_id)?.name || t('Select Generic')}
                    </div>
                    <button
                      type="button"
                      class="input-action-control__btn"
                      title={t('Select Generic')}
                      aria-label={t('Select Generic')}
                      on:click={async () => {
                        generic_id = '';
                        generic_search = '';
                        showGenericDropdown = true;
                        filteredGenerics = generics;

                        await tick();

                        form_generic_search_input?.focus();
                        if (window.mdb) {
                          initMdbInputs();
                        }
                      }}>
                      <i class="bi bi-chevron-down"></i>
                    </button>
                  </div>
                {:else if generic_id}
                <div class="input-group input-group-sm w-100">
                  <span class="input-group-text bg-secondary text-white fw-bold"
                    ><i class="bi bi-app-indicator"></i>
                  </span>
                  <span class="input-group-text badge-secondary w-100 fw-bold">
                    {t('Generic')}: {generics.find((c) => c.id == generic_id)
                      ? generics.find((c) => c.id == generic_id)?.name
                      : t('Select Generic')}
                  </span>
                  <button
                    class="btn btn-danger btn-sm pt-1"
                    on:click={async () => {
                      generic_id = '';
                      generic_search = '';
                      showGenericDropdown = true;
                      filteredGenerics = generics;

                      await tick();

                      form_generic_search_input?.focus();
                      if (window.mdb) {
                        initMdbInputs();
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
                </div>
                {:else if asPage}
                  <div class="input-action-control">
                    <input
                      type="text"
                      class="input-action-control__input"
                      id="form_generic_search"
                      bind:this={form_generic_search_input}
                      bind:value={generic_search}
                      placeholder={t('Select Generic')}
                      on:input={() => {
                        showGenericDropdown = true;
                        filteredGenerics = generics.filter((generic) => {
                          const name = generic.name;
                          return name && name.toLowerCase().includes(generic_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showGenericDropdown = true;
                        if (generic_search.trim()) {
                          filteredGenerics = generics.filter((generic) => {
                            const name = generic.name;
                            return name && name.toLowerCase().includes(generic_search.trim().toLowerCase());
                          });
                        } else {
                          filteredGenerics = generics;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showGenericDropdown = false), 150)}
                      autocomplete="off" />
                    <button
                      type="button"
                      class="input-action-control__btn input-action-control__btn--create"
                      title={t('Create Product Generic')}
                      aria-label={t('Create Product Generic')}
                      on:click={() => {
                        genericModalRef.openProductGenericModal();
                      }}>
                      <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                    </button>
                  </div>
                {:else}
                  <div class="field-quick-create-wrap w-100">
                    <div class="form-outline" data-mdb-input-init>
                      <input
                        type="text"
                        class="form-control form-control-sm field-quick-create-input"
                        id="form_generic_search"
                        bind:this={form_generic_search_input}
                        bind:value={generic_search}
                        on:input={() => {
                          showGenericDropdown = true;
                          filteredGenerics = generics.filter((generic) => {
                            const name = generic.name;
                            return name && name.toLowerCase().includes(generic_search.trim().toLowerCase());
                          });
                        }}
                        on:focus={() => {
                          showGenericDropdown = true;
                          if (generic_search.trim()) {
                            filteredGenerics = generics.filter((generic) => {
                              const name = generic.name;
                              return name && name.toLowerCase().includes(generic_search.trim().toLowerCase());
                            });
                          } else {
                            filteredGenerics = generics;
                          }
                        }}
                        on:blur={() => setTimeout(() => (showGenericDropdown = false), 150)}
                        autocomplete="off" />
                      <label class="form-label" for="form_generic_search">{t('Select Generic')}</label>
                    </div>
                    <button
                      type="button"
                      class="field-quick-create-btn"
                      title={t('Create Product Generic')}
                      aria-label={t('Create Product Generic')}
                      on:click={() => {
                        genericModalRef.openProductGenericModal();
                      }}>
                      <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Add')}</span>
                    </button>
                  </div>
                {/if}
                {#if showGenericDropdown && filteredGenerics.length > 0}
                  <ul class="list-group product-picker-menu position-absolute w-100 z-3">
                    {#each filteredGenerics as generic}
                      <li
                        class="list-group-item list-group-item-action"
                        on:mousedown={() => {
                          generic_id = generic.id;
                          generic_search = '';
                          showGenericDropdown = false;
                          setTimeout(() => {
                            if (window.mdb) {
                              initMdbInputs(document);
                            }
                          }, 100);
                        }}>
                        {generic.name}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          {/if}
          <div class="field col-md-12 mb-3 product-grid-full product-code-field full-width {_translate_org_type == 'exchange' ? 'd-none' : ''}">
            {#if asPage}
            <label class="field-label" for="productCode">{t('Product Code')}</label>
            <div class="input-action-control">
              <input
                type="text"
                id="productCode"
                class="input-action-control__input"
                on:keydown={(e) => {
                  if (e.key == 'Enter') {
                    selectImage = true;
                    loadProductData(code);
                  }
                }}
                bind:value={code} />
              <button
                type="button"
                id="generateEanBtn"
                class="input-action-control__btn input-action-control__btn--create"
                title={t('Create Code')}
                aria-label={t('Create Code')}
                on:click={() => {
                  code = generateEAN13();
                }}>
                <i class="bi bi-upc" aria-hidden="true"></i><span class="input-action-control__btn-text">{t('Create Code')}</span>
              </button>
            </div>
            {:else}
            <label class="product-static-label" for="productCode">{t('Product Code')}</label>
            <div class="input-group input-group-sm">
              <input
                type="text"
                id="productCode"
                class="form-control form-control-sm"
                on:keydown={(e) => {
                  if (e.key == 'Enter') {
                    selectImage = true;
                    loadProductData(code);
                  }
                }}
                bind:value={code} />
              <button
                type="button"
                id="generateEanBtn"
                class="btn btn-outline-secondary btn-sm pt-1 d-inline-flex align-items-center flex-nowrap gap-1"
                title={t('Create Code')}
                aria-label={t('Create Code')}
                on:click={() => {
                  code = generateEAN13();
                }}>
                <i class="bi bi-upc" aria-hidden="true"></i>{t('Create Code')}
              </button>
            </div>
            {/if}
            <div id="productCodeInvalidFeedback" class="invalid-feedback mt-0" style="font-size:12px">
              {t('Code must be unique')}
            </div>
          </div>

            </div>
          </section>

          <section class="form-card form-card-pricing-stock">
            <h3 class="form-card__title section-title">{t('Pricing & Stock')}</h3>
            <div class="form-grid product-form-grid">
          <div class="field col-md-{enablePercent ? '5' : '6'} mb-3 product-span-3 product-price-row">
            {#if asPage}
              <label class="field-label" for="buy_price">
                {#if type != 'service'}
                  {t('Buy Price')}
                {:else}
                  {t('Cost Price')}
                {/if}
              </label>
            {/if}
            {#if asPage}
              <div class="price-control">
                <input
                  type="number"
                  id="buy_price"
                  class="input price-input"
                  bind:value={buy_price}
                  on:input={() => {
                    if (enablePercent) {
                      sell_price = Number(
                        parseFloat(buy_price) + (parseFloat(buy_price) * parseFloat(percentage)) / 100,
                      ).toFixed(3);
                    }
                  }} />
                <div class="price-control__currency-select">
                  <FilterSelect
                    variant="outline"
                    label={t('Currency')}
                    icon="bi-currency-exchange"
                    value={buy_currency || defaultCurrency}
                    options={currencySelectOptions}
                    on:change={(event) => {
                      buy_currency = event.detail;

                      if (enablePercent) {
                        sell_currency = event.detail;
                      }
                    }} />
                </div>
              </div>
            {:else}
            <div class="input-group input-group-sm field-currency-group">
              <div class="form-outline flex-grow-1" data-mdb-input-init>
                <input
                  type="number"
                  id="buy_price"
                  class="form-control form-control-sm field-currency-input"
                  bind:value={buy_price}
                  on:input={() => {
                    if (enablePercent) {
                      sell_price = Number(
                        parseFloat(buy_price) + (parseFloat(buy_price) * parseFloat(percentage)) / 100,
                      ).toFixed(3);
                    }
                  }} />
                <label class="form-label" for="buy_price">
                  {#if type != 'service'}
                    {t('Buy Price')}
                  {:else}
                    {t('Cost Price')}
                  {/if}
                </label>
              </div>
              <button
                id="buyCurrencyDropdown"
                class="field-currency-btn dropdown-toggle"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {buy_currency ? t(buy_currency) : t(defaultCurrency)}
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={buy_currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        buy_currency = cur.code;

                        if (enablePercent) {
                          sell_currency = cur.code;
                        }
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
            {/if}
          </div>
          <div class="field col-md-{enablePercent ? '7' : '6'} mb-3 product-span-3 product-price-row">
            {#if asPage}
              <label class="field-label" for="sell_price">{t('Sell Price')}</label>
            {/if}
            {#if asPage}
              <div class="price-control-row">
                {#if enable_product_benefit_percentage}
                  <button
                    class="price-control-row__percent {enablePercent ? 'is-active' : ''}"
                    type="button"
                    on:click={() => {
                      enablePercent = !enablePercent;
                      if (!enablePercent) {
                        if (buy_price && sell_price < buy_price) {
                          sell_price = buy_price;
                        }
                        sell_currency = buy_currency;
                      }
                    }}>
                    <i class="bi bi-percent"></i>
                  </button>
                {/if}
                {#if enablePercent}
                  <input
                    type="number"
                    id="percentage_markup"
                    class="input price-control-row__percent-input"
                    bind:value={percentage}
                    on:input={() => {
                      sell_price = Number(
                        parseFloat(buy_price) + (parseFloat(buy_price) * parseFloat(percentage)) / 100,
                      ).toFixed(3);
                    }} />
                {/if}
                <div class="price-control">
                  <input
                    type="number"
                    id="sell_price"
                    class="input price-input"
                    readonly={enablePercent}
                    bind:value={sell_price}
                    on:blur={() => {
                      if (sell_currency == buy_currency && +sell_price < +buy_price) {
                        sell_price = buy_price;
                      }
                    }} />
                  <div class="price-control__currency-select">
                    <FilterSelect
                      variant="outline"
                      label={t('Currency')}
                      icon="bi-currency-exchange"
                      value={sell_currency || defaultCurrency}
                      options={currencySelectOptions}
                      on:change={(event) => {
                        if (!enablePercent) {
                          sell_currency = event.detail;
                        }
                      }} />
                  </div>
                </div>
              </div>
            {:else}
            <div class="input-group input-group-sm">
              {#if enable_product_benefit_percentage}
                <button
                  class="btn {enablePercent ? 'btn-warning' : 'btn-outline-secondary'} px-1 pt-1 btn-sm"
                  on:click={() => {
                    enablePercent = !enablePercent;
                    if (!enablePercent) {
                      if (buy_price && sell_price < buy_price) {
                        sell_price = buy_price;
                      }
                      sell_currency = buy_currency;
                    }
                    setTimeout(() => {
                      if (window.mdb) {
                        initMdbInputs();
                        productModalEl?.querySelectorAll('.dropdown-toggle').forEach((el) => {
                          new window.mdb.Dropdown(el);
                        });
                      }
                    }, 50);
                  }}
                  ><i class="bi bi-percent"></i>
                </button>
              {/if}

              {#if enablePercent}
                <div class="form-outline flex-grow-1 {enablePercent ? '' : 'd-none'}" data-mdb-input-init>
                  <input
                    type="number"
                    id="percentage_markup"
                    class="form-control form-control-sm"
                    bind:value={percentage}
                    on:input={() => {
                      sell_price = Number(
                        parseFloat(buy_price) + (parseFloat(buy_price) * parseFloat(percentage)) / 100,
                      ).toFixed(3);
                    }} />

                  <label class="form-label" for="percentage_markup">{t('Percent')}</label>
                </div>
              {/if}
              <div class="input-group input-group-sm field-currency-group flex-grow-1">
                <div class="form-outline flex-grow-1" data-mdb-input-init>
                  <input
                    type="number"
                    id="sell_price"
                    class="form-control form-control-sm field-currency-input"
                    readonly={enablePercent}
                    bind:value={sell_price}
                    on:blur={() => {
                      if (sell_currency == buy_currency && +sell_price < +buy_price) {
                        sell_price = buy_price;
                      }
                    }} />
                  <label class="form-label" for="sell_price">{t('Sell Price')}</label>
                </div>

                <button
                  id="sellCurrencyDropdown"
                  class="field-currency-btn dropdown-toggle"
                  type="button"
                  data-mdb-toggle="dropdown"
                  aria-expanded="false">
                  {sell_currency ? t(sell_currency) : t(defaultCurrency)}
                </button>

                <ul class="dropdown-menu dropdown-menu-end">
                  {#each currencies as cur}
                    <li>
                      <button
                        class="dropdown-item"
                        style={sell_currency == cur.code
                          ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                          : ''}
                        on:click={() => {
                          if (!enablePercent) {
                            sell_currency = cur.code;
                          }
                        }}
                        type="button">
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
            {/if}
          </div>

          {#if type == 'product' || type == 'sale'}
            {#if !editingId || oldProductinitial_warehouse_id == 0}
              <div class="field col-md-6 mb-3 product-span-2 product-stock-row">
                {#if asPage}
                  <FilterSelect
                    label={t('Select Warehouse')}
                    
                    value={selectedWarehouseId ?? ''}
                    options={warehouseFilterOptions}
                    on:change={(e) => {
                      selectedWarehouseId = e.detail === '' || e.detail == null ? '' : e.detail;
                    }} />
                {:else}
                  <select id="c-warehouse-id" class="form-select form-select-sm" bind:value={selectedWarehouseId}>
                    <option value="">{t('Select Warehouse')}</option>

                    {#each warehouses as warehouse}
                      <option value={warehouse.id}>{warehouse.name}</option>
                    {/each}
                  </select>
                {/if}
              </div>
              <div class="field col-md-6 mb-3 product-span-2 product-stock-row">
                {#if asPage}
                  <label class="field-label" for="c-warehouse-quantity">{t('Warehouse Quantity')}</label>
                  <input
                    type="number"
                    id="c-warehouse-quantity"
                    class="input"
                    bind:value={warehouseQuantity} />
                {:else}
                <div class="form-outline" data-mdb-input-init>
                  <input
                    type="number"
                    id="c-warehouse-quantity"
                    class="form-control form-control-sm"
                    bind:value={warehouseQuantity} />
                  <label class="form-label" for="c-warehouse-quantity">{t('Warehouse Quantity')}</label>
                </div>
                {/if}
              </div>
            {/if}
          {/if}

          {#if enable_batch}
            <div class="field col-md-6 mb-3 product-stock-row">
              {#if asPage}
                <label class="field-label" for="c-batch">{t('Batch')}</label>
                <input type="text" id="c-batch" class="input" bind:value={batch} />
              {:else}
                <div class="form-outline" data-mdb-input-init>
                  <input type="text" id="c-batch" class="form-control form-control-sm" bind:value={batch} />
                  <label class="form-label" for="c-batch">{t('Batch')}</label>
                </div>
              {/if}
            </div>
          {/if}
          {#if enable_manufacturing_date}
            <div class="field col-md-6 mb-3 product-stock-row">
              <label class="field-label" for="c-manufacturing_date">{t('Manufacturing Date')}</label>
              <div class="input-group input-group-sm persianDatePicker product-date-picker">
                <input
                  type="date"
                  id="c-manufacturing_date"
                  class="form-control form-control-sm"
                  data-bind="manufacturing_date"
                  bind:value={manufacturing_date} />
                <span class="input-group-text persian-date-text"></span>
              </div>
            </div>
          {/if}
          {#if enable_expiry_date}
            <div class="field col-md-6 mb-3 product-stock-row">
              <label class="field-label" for="c-expiry_date">{t('Expiry Date')}</label>
              <div class="input-group input-group-sm persianDatePicker product-date-picker">
                <input
                  type="date"
                  id="c-expiry_date"
                  class="form-control form-control-sm"
                  data-bind="expiry_date"
                  bind:value={expiry_date} />
                <span class="input-group-text persian-date-text"></span>
              </div>
            </div>
          {/if}
          {#if type != 'service'}
            {#if enable_expiry_date}
              <div class="field col-md-6 mb-3 product-stock-row">
                {#if asPage}
                  <label class="field-label" for="c-alarm_expiry_days">{t('Alarm Expiry Days')}</label>
                  <input
                    type="number"
                    min="0"
                    id="c-alarm_expiry_days"
                    class="input"
                    bind:value={alarm_expiry_days} />
                {:else}
                  <div class="form-outline" data-mdb-input-init>
                    <input
                      type="text"
                      id="c-alarm_expiry_days"
                      class="form-control form-control-sm"
                      bind:value={alarm_expiry_days} />
                    <label class="form-label" for="c-alarm_expiry_days">{t('Alarm Expiry Days')}</label>
                  </div>
                {/if}
              </div>
            {/if}
            <div class="field col-md-{enable_expiry_date ? 6 : 12} mb-3 product-span-2 product-stock-row {_translate_org_type == 'exchange' ? 'd-none' : ''}">
              {#if asPage}
                <label class="field-label" for="c-alarm_quantity">{t('Alarm Quantity')}</label>
              {/if}
              <div class="input-group input-group-sm">
                {#if !asPage}
                <div class="form-outline" data-mdb-input-init>
                  <input
                    type="text"
                    id="c-alarm_quantity"
                    class="form-control form-control-sm"
                    bind:value={alarm_quantity} />
                  <label class="form-label" for="c-alarm_quantity">{t('Alarm Quantity')}</label>
                </div>
                {:else}
                  <input
                    type="text"
                    id="c-alarm_quantity"
                    class="input"
                    bind:value={alarm_quantity} />
                {/if}
                {#if product_unit_id}
                  <span class="input-group-text">
                    {product_unit_id ? units.find((u) => u.id == product_unit_id)?.name : t('Select Unit')}
                  </span>
                {/if}
              </div>
            </div>
          {/if}

            </div>
          </section>

          <section class="form-card form-card-extra">
            <h3 class="form-card__title section-title">{t('Extra Information')}</h3>
            <div class="form-grid product-form-grid">
          {#if _translate_org_type == 'exchange'}
            <div class="col-md-6">
              <label class="form-label" for="c-image"
                >{#if modalImageUrl}
                  <img
                    src={modalImageUrl}
                    alt="Preview"
                    style="max-width:100%;height:auto;border-radius:10px;border:1px solid #ddd;" />
                {:else}
                  <div
                    style="width:60px;height:60px;margin:auto;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:10px;color:#999;font-size:10px;">
                    {t('No Image Selected')}
                  </div>
                {/if}
              </label>

              <div class="col-md-4">
                <input
                  type="file"
                  id="c-image"
                  accept="image/*"
                  on:change={handleImageUpload}
                  class="form-control form-control-sm" />
              </div>
            </div>
          {:else if asPage}
            <div class="field col-md-12 product-image-field">
              <label class="field-label" for="c-image">{t('Image')}</label>
              <div
                class="image-upload"
                on:paste={(e) => handlePasteImage(e)}
                on:dragover={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                on:dragenter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                on:drop={(e) => {
                  console.log('DROP FIRED', e.dataTransfer);
                  handleDropImage(e);
                }}>
                {#if modalImageUrl}
                  <img src={modalImageUrl} alt="Preview" class="preview-image" />
                {:else}
                  <div class="image-upload__icon" aria-hidden="true">
                    <i class="bi bi-cloud-arrow-up"></i>
                  </div>
                  <p class="image-upload__text">{t('Drag product image here or select')}</p>
                {/if}
                <div class="image-upload__actions">
                  <label class="btn-secondary image-upload__choose" for="c-image">
                    <i class="bi bi-upload"></i>
                    {t('Select Image')}
                  </label>
                  <button
                    type="button"
                    class="btn-neutral image-upload__search"
                    on:click={searchImageOnGoogle}
                    disabled={!name?.trim()}>
                    <i class="bi bi-search"></i>
                    {t('Search Image')}
                  </button>
                </div>
                <p class="image-upload__hint">{t('Image upload formats hint')}</p>
                <input
                  type="file"
                  id="c-image"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  on:change={handleImageUpload}
                  class="product-image-input" />
              </div>
            </div>
          {:else}
            <div class="col-md-6 product-image-field">
              <label class="product-static-label" for="c-image">{t('Image')}</label>
              <button
                type="button"
                class="image-search-btn"
                on:click={searchImageOnGoogle}
                disabled={!name?.trim()}>
                <i class="bi bi-search"></i>{t('Search Image')}
              </button>
              <div
                class="product-image-dropzone"
                on:paste={(e) => handlePasteImage(e)}
                on:dragover={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                on:dragenter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                on:drop={(e) => {
                  console.log('DROP FIRED', e.dataTransfer);
                  handleDropImage(e);
                }}>
                {#if modalImageUrl}
                  <img src={modalImageUrl} alt="Preview" class="preview-image" />
                {:else}
                  <div class="preview-empty">
                    <i class="bi bi-image"></i>
                    <span>{t('No Image Selected')}</span>
                  </div>
                {/if}
                <span class="image-dropzone-text">{t('Paste or Drop Image Here')}</span>
                <label class="choose-image-btn" for="c-image">
                  <i class="bi bi-upload"></i>
                  {t('Select Image')}
                </label>
                <input
                  type="file"
                  id="c-image"
                  accept="image/*"
                  on:change={handleImageUpload}
                  class="product-image-input" />
              </div>
            </div>
          {/if}

          <div class="field col-md-12 product-description-field">
            {#if asPage}
              <label class="field-label" for="c-description">{t('Description')}</label>
              <div class="description-field-body">
                <textarea
                  id="c-description"
                  class="textarea description-textarea"
                  rows="5"
                  maxlength="1000"
                  bind:value={description}></textarea>
                <div class="field-counter">{description.length}/1000</div>
              </div>
            {:else}
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control form-control-sm" rows="5" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
            {/if}
          </div>
            </div>
          </section>
        </div>
        {#if selectImage}
          <div class="row mt-4 {asPage ? 'product-image-search-results' : ''}">
            <div class="col-md-4">
              {#if loadingProductData}
                <div
                  style="width:60px;height:60px;margin:auto;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:10px;color:#999;font-size:10px;">
                  {t('Loading...')}
                </div>
              {:else if !notFound}
                {#if productData?.image_url}
                  <img
                    on:click={() => setRemoteImage(productData.image_url)}
                    src={productData.image_url}
                    alt="Preview"
                    style="max-width:100%;height:auto;border-radius:10px;border:1px solid #ddd;cursor:pointer" />
                {/if}
              {/if}

              {#if loadingProductData2}
                <div
                  style="width:60px;height:60px;margin:auto;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:10px;color:#999;font-size:10px;">
                  {t('Loading...')}
                </div>
              {:else if !notFound2}
                {#if productData2?.image_url}
                  <img
                    on:click={() => setRemoteImage(productData2.image_url)}
                    src={productData2.image_url}
                    alt="Preview"
                    style="max-width:100%;height:auto;border-radius:10px;border:1px solid #ddd;cursor:pointer" />
                {/if}
              {/if}
            </div>
            <div class="col-md-4">
              {#if loadingProductData}
                <div
                  style="width:60px;height:60px;margin:auto;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:10px;color:#999;font-size:10px;">
                  {t('Loading...')}
                </div>
              {:else if !notFound}
                {#if productData?.image_ingredients_url}
                  <img
                    on:click={() => setRemoteImage(productData.image_ingredients_url)}
                    src={productData.image_ingredients_url}
                    alt="Preview"
                    style="max-width:100%;height:auto;border-radius:10px;border:1px solid #ddd;cursor:pointer" />
                {/if}
              {/if}
              {#if loadingProductData2}
                <div
                  style="width:60px;height:60px;margin:auto;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:10px;color:#999;font-size:10px;">
                  {t('Loading...')}
                </div>
              {:else if !notFound2}
                {#if productData2?.image_ingredients_url}
                  <img
                    on:click={() => setRemoteImage(productData2.image_ingredients_url)}
                    src={productData2.image_ingredients_url}
                    alt="Preview"
                    style="max-width:100%;height:auto;border-radius:10px;border:1px solid #ddd;cursor:pointer" />
                {/if}
              {/if}
            </div>

            <div class="col-md-4">
              <input
                type="file"
                id="c-image"
                accept="image/*"
                on:change={handleImageUpload}
                class="form-control form-control-sm" />
            </div>
          </div>
        {/if}
        {/if}
      </div>
      {#if !asPage}
      <div class="modal-footer product-modal-footer">
        {#if type == 'service'}
        <div class="qa-service-footer">
          <button type="button" class="qa-service-footer__submit" on:click={() => saveProduct()}>
            {editingId ? t('Update Service') : t('Save Service')}
          </button>

          <div class="qa-service-footer__links">
            {#if !editingId}
              <button type="button" class="qa-service-footer__link" on:click={() => saveProduct('again')}>
                {t('Save Service and Add Another')}
              </button>
            {/if}

            <button
              type="button"
              class="qa-service-footer__link qa-service-footer__link--muted"
              data-mdb-dismiss="modal"
              on:click={closeProductForm}>
              {t('Close')}
            </button>
          </div>
        </div>
        {:else}
        <button type="button" class="product-footer-btn product-footer-btn--close" data-mdb-dismiss="modal" on:click={closeProductForm}>
          {t('Close')}
        </button>
        <div class="product-footer-actions">
          {#if !editingId}
            <button type="button" class="product-footer-btn product-footer-btn--secondary" on:click={() => saveProduct('again')}>
              {#if type == 'service'}
                {t('Save Service and Add Another')}
              {:else}
                {t('Save Product and Add Another')}
              {/if}
            </button>
          {/if}
          <button type="button" class="product-footer-btn product-footer-btn--primary" on:click={() => saveProduct()}>
            {#if type == 'service'}
              {editingId ? t('Update Service') : t('Save Service')}
            {:else}
              {editingId ? t('Update Product') : t('Save Product')}
            {/if}
          </button>
        </div>
        {/if}
      </div>
      {/if}
    </div>
  </div>
</div>
{#if showSearchImageModal}
  <div class="modal show d-block" id="searchImageModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-search"></i>
            {t('Search Image')}
          </h5>
          <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>
  </div>
{/if}

<CategoryModal
  bind:this={catModalRef}
  on:saved={async (e) => {
    const response = await productCategoryApi.getAll({
      status: 1,
    });

    categories = response?.data || [];
    category_id = e.detail.id;
  }} />

<UnitModal
  bind:this={unitModalRef}
  on:saved={async (e) => {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    product_unit_id = e.detail.id;
    /* A unit created from here may belong to a category this form is not
     * filtering by, so follow it to its own category. */
    applyUnitCategoryFromUnit(product_unit_id);
  }} />

<BrandModal
  bind:this={brandModalRef}
  on:saved={async (e) => {
    const brandResponse = await productBrandApi.getAll({ status: 1 });
    brands = brandResponse?.data || [];
    brand_id = e.detail.id;
  }} />

<GenericModal
  bind:this={genericModalRef}
  on:saved={async (e) => {
    const genericResponse = await productGenericApi.getAll({ status: 1 });
    generics = genericResponse?.data || [];
    generic_id = e.detail.id;
  }} />



<style>
  .modal,
  .modal * {
    pointer-events: auto !important;
  }

  :global(.modal-backdrop) {
    pointer-events: none !important;
  }

  :global(.product-modal-root.modal) {
    background: rgba(15, 23, 42, 0.58);
  }

  :global(.product-form-page .product-form-page__body) {
    width: 100%;
  }

  :global(.product-form-page .product-form-page__inner) {
    width: 100%;
  }

  :global(.product-modal-root .modal-dialog) {
    width: min(100% - 24px, 620px);
    max-width: 620px;
    margin-inline: auto;
  }

  :global(.product-modal) {
    position: relative;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
    padding: 0;
  }

  :global(.product-modal.simple-modal__panel) {
    padding: 0;
  }

  .product-modal-header {
    min-height: auto;
    display: block;
    padding: 14px 18px 12px;
    padding-inline-end: 54px;
    border-bottom: 1px solid #e5e7eb;
    background: #ffffff;
    text-align: start;
  }

  .product-modal-heading {
    min-width: 0;
    text-align: start;
  }

  .product-modal-heading__icon {
    display: none;
  }

  .product-modal-header__text {
    min-width: 0;
  }

  .product-modal-title {
    margin: 0;
    color: #0f172a;
    font-size: 0.98rem;
    font-weight: 800;
    line-height: 1.4;
  }

  .product-modal-subtitle {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 0.78rem;
    line-height: 1.6;
  }

  .product-modal-close,
  .product-footer-btn {
    appearance: none;
    font-family: inherit;
    cursor: pointer;
  }

  .product-modal-close {
    position: absolute;
    top: 12px;
    inset-inline-end: 12px;
    z-index: 2;
    width: 32px;
    min-width: 32px;
    height: 32px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
    color: #475569;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .product-modal-close:hover {
    background: #f8fafc;
    color: #0f172a;
  }

  /* Service quick-action modal: same compact shell as the category popup. */
  :global(.product-modal-root.qa-service-modal .modal-dialog) {
    width: min(100% - 24px, 32.5rem);
    max-width: 32.5rem;
    /*
     * The service form is taller than the category popup, so top-align the
     * dialog: centered flex would push the header above the scroll area on
     * short screens and leave the title and close button unreachable.
     */
    align-items: flex-start;
    display: flex;
    min-height: calc(100% - 2rem);
  }

  :global(.product-modal-root.qa-service-modal .modal-content.product-modal) {
    border-radius: 0.875rem;
  }

  :global(.product-modal-root.qa-service-modal .product-modal-header) {
    padding: 0.9rem 1.35rem 0.75rem;
    padding-inline-end: 3.25rem;
  }

  :global(.product-modal-root.qa-service-modal .product-modal-title) {
    font-size: 1.05rem;
  }

  :global(.product-modal-root.qa-service-modal .product-modal-subtitle) {
    margin-top: 0.25rem;
    font-size: 0.84rem;
    line-height: 1.55;
  }

  :global(.product-modal-root.qa-service-modal .product-modal-body) {
    padding: 1rem 1.35rem;
  }

  :global(.product-modal-root.qa-service-modal .product-modal-footer) {
    display: block;
    padding: 0.9rem 1.35rem 1rem;
  }

  .qa-service-footer {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }

  .qa-service-footer__submit {
    width: 100%;
    min-height: 2.5rem;
    border: none;
    border-radius: 0.625rem;
    background: #0f6efd;
    color: #ffffff;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .qa-service-footer__submit:hover {
    background: #1d4ed8;
  }

  .qa-service-footer__links {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .qa-service-footer__link {
    padding: 0;
    border: 0;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 650;
    cursor: pointer;
  }

  .qa-service-footer__link:hover {
    text-decoration: underline;
  }

  .qa-service-footer__link--muted {
    color: #64748b;
  }

  :global(.product-modal-body) {
    max-height: calc(100vh - 160px);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 14px 18px;
    background: #ffffff;
  }

  :global(.product-form-grid) {
    display: grid !important;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px 12px;
    width: 100%;
    margin: 0;
  }

  :global(.product-form-grid > [class*='col-']) {
    width: auto;
    max-width: none;
    padding: 0;
    margin: 0 !important;
    min-width: 0;
    grid-column: span 3;
    order: 20;
  }

  .product-grid-full,
  :global(.product-form-grid > .col-md-12) {
    grid-column: 1 / -1;
  }

  .product-span-2 {
    grid-column: span 2 !important;
  }

  .product-span-3 {
    grid-column: span 3 !important;
  }

  .product-main-row {
    order: 1 !important;
  }

  .product-code-field {
    order: 2 !important;
  }

  .product-price-row {
    order: 3 !important;
  }

  .product-stock-row {
    order: 4 !important;
  }

  :global(.product-form-grid > [class*='col-']),
  .product-code-field {
    padding: 0 !important;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .product-static-label,
  :global(.product-modal-body .form-label) {
    display: block;
    margin: 0 0 5px !important;
    padding: 0 !important;
    color: #334155;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.35;
    text-align: start;
  }

  :global(.product-modal-body .form-outline .form-notch) {
    display: none !important;
  }

  :global(.product-modal-body .form-outline) {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  :global(.product-modal-body .form-outline .form-label) {
    position: static !important;
    order: 1;
    transform: none !important;
    max-width: none !important;
    pointer-events: auto;
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
  }

  :global(.product-modal-body .form-outline .form-control) {
    order: 2;
  }

  :global(.product-modal-body .form-control),
  :global(.product-modal-body .form-select),
  :global(.product-modal-body .form-outline .form-control) {
    width: 100%;
    min-height: var(--control-height);
    border: 1px solid #dbe3ef !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    color: #0f172a;
    padding-block: 6px !important;
    padding-inline: 10px !important;
    font-size: 0.82rem;
    line-height: 1.4;
    text-align: start;
    box-shadow: none !important;
  }

  :global(.product-modal-body textarea.form-control) {
    min-height: 90px;
    resize: vertical;
  }

  :global(.product-modal-body .form-control:focus),
  :global(.product-modal-body .form-select:focus),
  :global(.product-modal-body .form-outline .form-control:focus),
  :global(.product-modal-body .form-outline .form-control.active) {
    border-color: #0f6efd !important;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12) !important;
    outline: none;
  }

  :global(.product-modal-body .input-group) {
    flex-wrap: nowrap;
    align-items: flex-end;
    width: 100%;
    max-width: 100%;
  }

  .field-quick-create-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  :global(.product-modal-body .field-quick-create-input) {
    padding-inline-end: 4.75rem !important;
  }

  .field-quick-create-btn {
    position: absolute;
    inset-inline-end: 6px;
    bottom: 5px;
    z-index: 4;
    width: auto;
    min-width: auto;
    height: 24px;
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0 0.45rem;
    border: none;
    border-radius: 9px;
    background: #0f6efd;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    line-height: 1;
  }

  .field-quick-create-btn:hover {
    background: #1d4ed8;
    color: #ffffff;
  }

  :global(.product-modal-body .input-group-text) {
    min-height: var(--control-height);
    border: 1px solid #dbe3ef;
    background: #f8fafc;
    color: #475569;
    font-size: 0.76rem;
    font-weight: 700;
    text-align: start;
  }

  :global(.product-modal-body .input-group .btn),
  :global(.product-modal-body .btn-outline-secondary) {
    min-height: var(--control-height);
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    background: #ffffff;
    color: #475569;
    padding-inline: 10px;
    font-size: 0.76rem;
    font-weight: 700;
    box-shadow: none;
  }

  :global(.product-modal-body .input-group .btn:hover),
  :global(.product-modal-body .btn-outline-secondary:hover) {
    background: #f8fafc;
    color: #0f172a;
  }

  :global(.product-modal-body .field-currency-group) {
    align-items: flex-end;
    flex-wrap: nowrap;
  }

  :global(.product-modal-body .field-currency-group .form-outline) {
    flex: 1;
    min-width: 0;
  }

  :global(.product-modal-body .field-currency-input) {
    border-start-end-radius: 0 !important;
    border-end-end-radius: 0 !important;
  }

  :global(.product-modal-body .field-currency-btn) {
    width: 76px;
    min-width: 76px;
    height: var(--control-height);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid #dbe3ef;
    border-inline-start: 0;
    border-start-start-radius: 0 !important;
    border-end-start-radius: 0 !important;
    border-start-end-radius: 12px !important;
    border-end-end-radius: 12px !important;
    background: #eef4ff;
    color: #0f6efd;
    padding-inline: 10px;
    font-size: 0.76rem;
    font-weight: 800;
    box-shadow: none;
  }

  :global(.product-modal-body .field-currency-btn:hover),
  :global(.product-modal-body .field-currency-btn:focus),
  :global(.product-modal-body .field-currency-btn.show) {
    border-color: #bfdbfe;
    background: #dbeafe;
    color: #1d4ed8;
  }

  :global(.product-modal-body .list-group) {
    margin-top: 8px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
    overflow: hidden;
  }

  :global(.product-modal-body .list-group-item) {
    border: 0;
    border-bottom: 1px solid #f1f5f9;
    color: #0f172a;
    font-size: 0.84rem;
    text-align: start;
  }

  :global(.product-modal-body .list-group-item:last-child) {
    border-bottom: 0;
  }

  :global(.product-modal-body .list-group-item:hover) {
    background: #f8fafc;
  }

  :global(.product-image-field) {
    display: grid;
    gap: 10px;
  }

  .image-search-btn,
  .select-image-btn,
  .choose-image-btn {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    background: #eef4ff;
    color: #0f6efd;
    padding-inline: 14px;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: none;
  }

  .image-search-btn:hover,
  .select-image-btn:hover,
  .choose-image-btn:hover {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .select-image-btn:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  :global(.product-image-dropzone) {
    min-height: 112px;
    display: grid;
    place-items: center;
    gap: 10px;
    padding: 10px;
    border: 1.5px dashed #cbd5e1;
    border-radius: 16px;
    background: #ffffff;
    color: #64748b;
    text-align: center;
  }

  .image-dropzone-text {
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 600;
  }

  .product-image-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  :global(.preview-image) {
    width: min(100%, 112px);
    height: 72px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    object-fit: cover;
  }

  :global(.preview-empty) {
    width: 92px;
    height: 64px;
    display: grid;
    place-items: center;
    gap: 6px;
    border: 1px dashed #cbd5e1;
    border-radius: 14px;
    background: #f8fafc;
    color: #94a3b8;
    font-size: 0.74rem;
    font-weight: 700;
    text-align: center;
  }

  :global(.preview-empty i) {
    font-size: 1.2rem;
  }

  :global(.product-description-field) {
    order: 90;
  }

  :global(.product-image-field) {
    order: 91;
  }

  :global(.product-description-field textarea) {
    min-height: 112px;
  }

  :global(.product-modal-footer) {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 18px 14px;
    border-top: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .product-footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .product-footer-btn {
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .product-footer-btn--primary {
    border: none;
    background: #0f6efd;
    color: #ffffff;
  }

  .product-footer-btn--primary:hover {
    background: #1d4ed8;
  }

  .product-footer-btn--secondary {
    border: 1px solid #bfdbfe;
    background: #eef4ff;
    color: #0f6efd;
  }

  .product-footer-btn--secondary:hover {
    background: #dbeafe;
  }

  .product-footer-btn--close {
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #475569;
  }

  .product-footer-btn--close:hover {
    background: #f8fafc;
    color: #0f172a;
  }

  .product-form-card {
    width: 100%;
  }

  .product-form-body {
    width: 100%;
  }

  /* Page mode layout */
  .product-form-page {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
    color: #0f172a;
  }

  .product-page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    padding: 16px 18px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
    width: 100%;
  }

  .product-page-header__main {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .product-page-header__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border-radius: 12px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 1.2rem;
  }

  .product-page-header__text {
    min-width: 0;
    text-align: start;
  }

  .product-page-header__title {
    margin: 0;
    color: #0f172a;
    font-size: 1.15rem;
    font-weight: 800;
    line-height: 1.35;
  }

  .product-page-header__subtitle {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .product-page-header__back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding: 10px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #ffffff;
    color: #475569;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .product-page-header__back:hover {
    background: #f8fafc;
    color: #0f172a;
  }

  .product-page-header__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
  }

  .field-label {
    display: block;
    margin-bottom: 6px;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
    text-align: start;
  }

  .field-required {
    color: #ef4444;
    margin-inline-start: 2px;
  }

  .field-counter {
    margin-top: 6px;
    color: #64748b;
    font-size: 12px;
    text-align: end;
  }

  .input-with-icon {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-with-icon__icon {
    position: absolute;
    inset-inline-start: 14px;
    color: #64748b;
    pointer-events: none;
    z-index: 1;
  }

  .input-with-icon .input {
    padding-inline-start: 40px;
  }

  .input-with-icon--end .input-with-icon__action {
    position: absolute;
    inset-inline-end: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
  }

  .input-with-icon--end .input {
    padding-inline-end: 48px;
  }

  .input-action-control {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--control-height);
    border: 1px solid #dbe7f3;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .input-action-control:hover {
    border-color: #bfdbfe;
    background: #f8fbff;
  }

  .input-action-control:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  .input-action-control__input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none !important;
    border-inline-end: 1px solid #dbe7f3;
    border-radius: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    background: transparent !important;
    padding-inline: 0.55rem;
    font-size: 0.8rem;
    font-weight: 500;
    color: #0f172a;
    text-align: start;
  }

  .input-action-control__input:focus {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }

  .input-action-control__input--selected {
    display: flex;
    align-items: center;
    border-inline-end: 1px solid #dbe7f3;
    color: #0f172a;
    cursor: default;
    user-select: none;
  }

  .input-action-control__btn {
    flex: 0 0 auto;
    flex-direction: row;
    flex-wrap: nowrap;
    width: auto;
    min-width: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    margin: 0;
    padding: 0 0.65rem;
    border: none;
    border-radius: 0 !important;
    background: transparent;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    line-height: 1;
    cursor: pointer;
    box-shadow: none !important;
    outline: none !important;
  }

  .input-action-control__btn :global(i),
  .input-action-control__btn-text,
  .field-quick-create-btn :global(i),
  .field-quick-create-btn .input-action-control__btn-text {
    display: inline-block;
    border: none;
    white-space: nowrap;
    line-height: 1;
    flex-shrink: 0;
  }

  .input-action-control__btn:hover {
    background: rgba(59, 130, 246, 0.06);
    color: #0f6efd;
  }

  .input-action-control__btn--create {
    background: #0f6efd;
    color: #ffffff;
  }

  .input-action-control__btn--create:hover,
  .input-action-control__btn--create:focus {
    background: #1d4ed8;
    color: #ffffff;
  }

  :global(.product-form-page .product-picker-menu) {
    margin-top: 0.3rem;
    padding: 0.35rem;
    max-height: 14rem;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 0.75rem;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
    background: #ffffff;
  }

  :global(.product-form-page .product-picker-menu::-webkit-scrollbar) {
    display: none;
  }

  :global(.product-form-page .product-picker-menu .list-group-item) {
    border: 0;
    border-radius: 0.5rem;
    margin-bottom: 0.1rem;
    padding: 0.42rem 0.6rem;
    color: #0f172a;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: start;
    background: transparent;
    cursor: pointer;
  }

  :global(.product-form-page .product-picker-menu .list-group-item:last-child) {
    margin-bottom: 0;
  }

  :global(.product-form-page .product-picker-menu .list-group-item:hover) {
    background: rgba(59, 130, 246, 0.06);
    color: #0f6efd;
  }

  :global(.product-form-page .filter-select) {
    width: 100%;
    max-width: none;
  }

  :global(.product-form-page .product-filter-menu) {
    min-width: 100%;
    padding: 0.35rem;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 0.75rem;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
  }

  :global(.product-form-page .product-filter-menu .dropdown-item) {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.42rem 0.6rem;
  }

  :global(.product-form-page .product-filter-menu .dropdown-item.active),
  :global(.product-form-page .product-filter-menu .dropdown-item:active) {
    background: rgba(59, 130, 246, 0.1) !important;
    color: #0f6efd !important;
  }

  :global(.product-form-page .price-control__currency),
  :global(.product-form-page .field-currency-btn) {
    border-inline-start: 1px solid #dbe7f3 !important;
    background: transparent !important;
    color: #64748b !important;
    font-size: 0.75rem !important;
    font-weight: 600 !important;
  }

  :global(.product-form-page .price-control__currency::after),
  :global(.product-form-page .field-currency-btn::after) {
    margin-inline-start: 0.25rem;
    font-size: 0.6rem;
    opacity: 0.6;
  }

  :global(.product-form-page .price-control__currency:hover),
  :global(.product-form-page .price-control__currency.show),
  :global(.product-form-page .field-currency-btn:hover),
  :global(.product-form-page .field-currency-btn.show) {
    background: rgba(59, 130, 246, 0.06) !important;
    color: #0f6efd !important;
  }

  :global(.product-form-page .price-control) {
    height: var(--control-height);
    border: 1px solid #dbe7f3;
    border-radius: 8px;
  }

  :global(.product-form-page .price-control:focus-within) {
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  .price-control {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--control-height);
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
  }

  .price-control:focus-within {
    border-color: #0f6efd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .price-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    background: transparent !important;
    padding-inline: 14px;
    text-align: start;
  }

  .price-input:focus {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }

  .price-control__currency {
    flex: 0 0 84px;
    width: 84px;
    min-width: 84px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding-inline: 8px;
    border: none;
    border-inline-start: 1px solid #dbe3ef;
    border-radius: 0 !important;
    background: #f8fafc;
    color: #0f6efd;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: none !important;
    outline: none !important;
  }

  .price-control__currency-select {
    flex: 0 0 4.5rem;
    width: 4.5rem;
    min-width: 4.5rem;
    border-inline-start: 1px solid #dbe3ef;
    background: #fff;
  }

  .price-control__currency-select :global(.filter-select) {
    width: 100%;
    height: 100%;
    padding-top: 0;
  }

  .price-control__currency-select :global(.filter-select__control) {
    height: 100%;
  }

  .price-control__currency-select :global(.filter-select__notch) {
    display: none;
  }

  .price-control__currency-select :global(.filter-select.outline .filter-select__trigger) {
    height: 100%;
    min-height: 100%;
    border: 0;
    border-radius: 0;
    gap: 0.2rem;
    padding: 0 0.35rem;
    color: #0f6efd;
    font-size: 0.75rem;
    font-weight: 700;
    background: #fff;
    box-shadow: none;
  }

  .price-control__currency-select :global(.filter-select.outline.is-open .filter-select__trigger),
  .price-control__currency-select :global(.filter-select.outline .filter-select__trigger:focus-visible) {
    box-shadow: none;
  }

  .price-control__currency::after {
    display: none;
  }

  .price-control__currency:hover,
  .price-control__currency:focus,
  .price-control__currency.show {
    background: #f8fafc;
    color: #0f6efd;
    box-shadow: none !important;
    outline: none !important;
  }

  .price-control-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
    width: 100%;
  }

  .price-control-row .price-control {
    flex: 1;
    min-width: 0;
  }

  .price-control-row__percent {
    flex: 0 0 38px;
    width: 38px;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
  }

  .price-control-row__percent.is-active {
    border-color: #f59e0b;
    background: #fffbeb;
    color: #d97706;
  }

  .price-control-row__percent-input {
    flex: 0 0 72px;
    width: 72px;
    min-width: 72px;
  }

  :global(.product-form-page .input),
  :global(.product-form-page .select),
  :global(.product-form-page .textarea) {
    width: 100%;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    background: #ffffff;
    padding-inline: 14px;
    color: #0f172a;
    font-size: 14px;
    text-align: start;
    outline: none;
    box-shadow: none;
  }

  :global(.product-form-page .input),
  :global(.product-form-page .select) {
    height: var(--control-height);
    min-height: var(--control-height);
  }

  :global(.product-form-page .textarea:not(.description-textarea)) {
    min-height: 120px;
    resize: vertical;
    padding-block: 12px;
  }

  :global(.product-form-page .description-textarea) {
    padding-block: 12px;
  }

  :global(.product-form-page .input:focus),
  :global(.product-form-page .select:focus),
  :global(.product-form-page .textarea:focus) {
    border-color: #0f6efd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .btn-primary,
  .btn-secondary,
  .btn-neutral {
    appearance: none;
    font-family: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
  }

  .btn-primary {
    border: none;
    border-radius: 12px;
    background: #0f6efd;
    color: #ffffff;
    padding: 12px 18px;
    font-weight: 800;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-secondary {
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    background: #eff6ff;
    color: #0f6efd;
    padding: 12px 18px;
    font-weight: 800;
  }

  .btn-secondary:hover {
    background: #dbeafe;
  }

  .btn-neutral {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #ffffff;
    color: #475569;
    padding: 12px 18px;
    font-weight: 700;
  }

  .btn-neutral:hover {
    background: #f8fafc;
    color: #0f172a;
  }

  .form-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 16px;
    padding: 14px 18px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  }

  .product-neighbor-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-inline-end: auto;
  }

  .product-neighbor-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 96px;
    min-height: 42px;
    padding: 10px 14px;
  }

  .product-neighbor-btn:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  :global(.product-form-page .form-actions) {
    position: sticky;
    bottom: 0;
    z-index: 30;
    backdrop-filter: blur(8px);
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.08);
  }

  .image-upload {
    border: 1px dashed #bfdbfe;
    border-radius: 16px;
    background: #ffffff;
    min-height: 130px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 18px;
    text-align: center;
  }

  .image-upload__icon {
    font-size: 1.8rem;
    color: #0f6efd;
  }

  .image-upload__text {
    margin: 0;
    color: #64748b;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .image-upload__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }

  .image-upload__choose,
  .image-upload__search {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--control-height);
    padding: 10px 16px;
    font-size: 0.84rem;
    line-height: 1.2;
  }

  .image-upload__hint {
    margin: 0;
    color: #94a3b8;
    font-size: 0.76rem;
  }

  .image-upload .preview-image {
    width: min(100%, 180px);
    height: 118px;
    object-fit: contain;
    border-radius: 12px;
  }

  .product-page-form,
  .form-card,
  .form-grid,
  .form-card__title {
    display: contents;
  }

  :global(.product-form-page .product-page-form) {
    display: flex;
    flex-direction: column;
    gap: 15px;
    width: 100%;
  }

  :global(.product-form-page .product-page-form-layout) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 16px;
    align-items: start;
    width: 100%;
  }

  :global(html[dir='rtl'] .product-form-page .product-page-form-layout) {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }

  :global(.product-form-page .product-page-form-layout .form-card-extra) {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  :global(.product-form-page .product-page-form-layout .form-card-basic) {
    grid-column: 2;
    grid-row: 1;
  }

  :global(.product-form-page .product-page-form-layout .form-card-pricing-stock) {
    grid-column: 2;
    grid-row: 2;
  }

  :global(html[dir='rtl'] .product-form-page .product-page-form-layout .form-card-extra) {
    grid-column: 2;
  }

  :global(html[dir='rtl'] .product-form-page .product-page-form-layout .form-card-basic),
  :global(html[dir='rtl'] .product-form-page .product-page-form-layout .form-card-pricing-stock) {
    grid-column: 1;
  }

  :global(.product-form-page .form-card) {
    display: block;
    margin: 0;
    padding: 17px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  }

  :global(.product-form-page .section-title),
  :global(.product-form-page .form-card__title) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 14px;
    color: #0f172a;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.4;
    text-align: start;
  }

  :global(.product-form-page .section-title::before),
  :global(.product-form-page .form-card__title::before) {
    content: '';
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #0f6efd;
  }

  :global(.product-form-page .product-form-grid) {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 16px;
    width: 100%;
    margin: 0;
  }

  :global(.product-form-page .product-name-field) {
    grid-column: 1 / -1 !important;
  }

  :global(.product-form-page .product-form-grid > [class*='col-']),
  :global(.product-form-page .product-form-grid > .field) {
    width: auto;
    max-width: none;
    min-width: 0;
    padding: 0;
    margin: 0 !important;
    grid-column: auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    order: 50;
  }

  :global(.product-form-page .product-grid-full),
  :global(.product-form-page .product-form-grid > .col-md-12),
  :global(.product-form-page .full-width) {
    grid-column: 1 / -1 !important;
  }

  :global(.product-form-page .product-span-2),
  :global(.product-form-page .product-span-3) {
    grid-column: auto !important;
  }

  :global(.product-form-page .product-main-row) {
    order: 11 !important;
  }

  :global(.product-form-page .product-code-field) {
    order: 12 !important;
  }

  :global(.product-form-page .product-price-row) {
    order: 21 !important;
  }

  :global(.product-form-page .product-stock-row) {
    order: 31 !important;
  }

  :global(.product-form-page .form-card-extra .product-form-grid) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  :global(.product-form-page .form-card-extra .product-image-field),
  :global(.product-form-page .form-card-extra .product-description-field) {
    grid-column: 1 / -1 !important;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  :global(.product-form-page .form-card-extra .image-upload) {
    width: 100%;
    min-height: 200px;
  }

  :global(.product-form-page .form-card-extra .description-field-body) {
    position: relative;
  }

  :global(.product-form-page .form-card-extra .description-textarea) {
    width: 100%;
    min-height: 140px;
    height: auto;
    padding-bottom: 28px;
    resize: vertical;
    box-sizing: border-box;
  }

  :global(.product-form-page .form-card-extra .product-description-field .field-counter) {
    position: absolute;
    bottom: 8px;
    inset-inline-end: 10px;
    margin: 0;
  }

  :global(.product-form-page .form-card-extra .image-upload) {
    min-height: 160px;
    height: auto;
    box-sizing: border-box;
  }

  :global(.product-form-page .product-image-search-results) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 14px;
    padding: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #f8fafc;
  }

  :global(.product-form-page .product-image-search-results .col-md-4) {
    width: 100%;
    max-width: none;
    flex: none;
    padding: 0;
  }

  :global(.product-form-page .product-image-search-results img) {
    width: 100%;
    max-width: 100%;
    height: auto;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    cursor: pointer;
  }

  :global(.product-form-page .product-description-field) {
    order: 41 !important;
  }

  :global(.product-form-page .product-image-field) {
    order: 42 !important;
  }

  :global(.product-form-page .form-outline) {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  :global(.product-form-page .form-outline .form-label) {
    position: static !important;
    transform: none !important;
    top: auto !important;
    inset-inline-start: auto !important;
    order: -1;
    margin: 0 0 6px !important;
    padding: 0 !important;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
    text-align: start;
    pointer-events: auto;
  }

  :global(.product-form-page .product-static-label),
  :global(.product-form-page .form-label) {
    margin: 0 0 6px !important;
    padding: 0 !important;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
    text-align: start;
  }

  :global(.product-form-page .form-control),
  :global(.product-form-page .form-select),
  :global(.product-form-page .form-outline .form-control) {
    min-height: var(--control-height);
    height: var(--control-height);
    border: 1px solid #dbe3ef !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    color: #0f172a;
    padding-block: 9px !important;
    padding-inline: 14px !important;
    font-size: 14px;
    line-height: 1.4;
    text-align: start;
    box-shadow: none !important;
  }

  :global(.product-form-page .form-control:focus),
  :global(.product-form-page .form-select:focus),
  :global(.product-form-page .form-outline .form-control:focus),
  :global(.product-form-page .form-outline .form-control.active) {
    border-color: #0f6efd !important;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12) !important;
    outline: none;
  }

  :global(.product-form-page .field-quick-create-wrap) {
    position: relative;
    display: block;
    width: 100%;
    min-height: var(--control-height);
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
  }

  :global(.product-form-page .field-quick-create-wrap:focus-within) {
    border-color: #0f6efd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  :global(.product-form-page .input-group:has(.field-quick-create-wrap)),
  :global(.product-form-page .field-quick-create-group) {
    border: none;
    background: transparent;
    box-shadow: none;
  }

  :global(.product-form-page .field-quick-create-wrap .form-outline) {
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
  }

  :global(.product-form-page .field-quick-create-input),
  :global(.product-form-page .field-quick-create-wrap .form-control),
  :global(.product-form-page .field-quick-create-wrap .form-outline .form-control) {
    width: 100%;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    background: transparent !important;
    padding-inline-end: 44px !important;
  }

  :global(.product-form-page .field-quick-create-input:focus),
  :global(.product-form-page .field-quick-create-wrap .form-control:focus),
  :global(.product-form-page .field-quick-create-wrap .form-outline .form-control:focus),
  :global(.product-form-page .field-quick-create-wrap .form-outline .form-control.active) {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }

  :global(.product-form-page .field-quick-create-wrap .form-outline .form-label) {
    display: none;
  }

  :global(.product-form-page .field-quick-create-btn) {
    position: absolute;
    inset-inline-end: 6px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: auto;
    min-width: auto;
    height: 28px;
    margin: 0;
    padding: 0 0.55rem;
    border-radius: 8px;
    background: #0f6efd;
    color: #ffffff;
    border: none;
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    line-height: 1;
    cursor: pointer;
  }

  :global(.product-form-page .field-quick-create-btn:hover) {
    background: #1d4ed8;
    color: #ffffff;
  }

  :global(.product-form-page .field-currency-group),
  :global(.product-form-page .price-control) {
    display: flex;
    align-items: stretch;
    flex-wrap: nowrap;
    height: var(--control-height);
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: none;
  }

  :global(.product-form-page .field-currency-outer) {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    gap: 8px;
    flex-wrap: nowrap;
  }

  :global(.product-form-page .field-currency-group:focus-within),
  :global(.product-form-page .price-control:focus-within) {
    border-color: #0f6efd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  :global(.product-form-page .field-currency-group .form-outline) {
    order: 2;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
  }

  :global(.product-form-page .field-currency-group .form-outline .form-label) {
    display: none;
  }

  :global(.product-form-page .field-currency-input),
  :global(.product-form-page .field-currency-group .form-control),
  :global(.product-form-page .field-currency-group .form-outline .form-control) {
    width: 100%;
    height: 100% !important;
    min-height: 0 !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    background: transparent !important;
    padding-inline: 14px;
    text-align: start;
  }

  :global(.product-form-page .field-currency-input:focus),
  :global(.product-form-page .field-currency-group .form-control:focus),
  :global(.product-form-page .field-currency-group .form-outline .form-control:focus),
  :global(.product-form-page .field-currency-group .form-outline .form-control.active) {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }

  :global(.product-form-page .field-currency-btn) {
    order: 1;
    flex: 0 0 92px;
    width: 92px;
    min-width: 92px;
    height: 100%;
    margin: 0;
    padding-inline: 10px;
    border: none;
    border-inline-end: 1px solid #dbe3ef;
    border-radius: 0 !important;
    background: #f8fafc;
    color: #0f6efd;
    font-size: 13px;
    font-weight: 700;
    outline: none !important;
    box-shadow: none !important;
  }

  :global(.product-form-page .field-currency-btn::after) {
    display: none;
  }

  :global(.product-form-page .field-currency-btn:hover),
  :global(.product-form-page .field-currency-btn:focus),
  :global(.product-form-page .field-currency-btn.show) {
    background: #f8fafc;
    color: #0f6efd;
    border-inline-end: 1px solid #dbe3ef;
    box-shadow: none !important;
    outline: none !important;
  }

  :global(.product-form-page .input-group-text),
  :global(.product-form-page .input-group .btn:not(.field-currency-btn)),
  :global(.product-form-page .btn-outline-secondary) {
    min-height: var(--control-height);
    border: 1px solid #dbe3ef;
    font-size: 13px;
    outline: none !important;
    box-shadow: none !important;
  }

  :global(.product-form-page textarea.form-control:not(.description-textarea)),
  :global(.product-form-page .product-description-field textarea:not(.description-textarea)) {
    min-height: 120px;
    height: auto;
    resize: vertical;
  }

  .product-form-section-title {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
    padding-inline: 2px;
    color: #0f172a;
    font-size: 0.98rem;
    font-weight: 800;
    text-align: start;
  }

  .product-form-section-title::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #0f6efd;
  }

  .product-section-basic {
    order: 10;
    margin-top: 0;
  }

  .product-section-pricing {
    order: 20;
  }

  .product-section-stock {
    order: 30;
  }

  .product-section-extra {
    order: 40;
  }

  @media (max-width: 768px) {
    :global(.product-form-page .product-page-form-layout) {
      grid-template-columns: 1fr;
    }

    :global(.product-form-page .product-page-form-layout .form-card-extra),
    :global(.product-form-page .product-page-form-layout .form-card-basic),
    :global(.product-form-page .product-page-form-layout .form-card-pricing-stock),
    :global(html[dir='rtl'] .product-form-page .product-page-form-layout .form-card-extra),
    :global(html[dir='rtl'] .product-form-page .product-page-form-layout .form-card-basic),
    :global(html[dir='rtl'] .product-form-page .product-page-form-layout .form-card-pricing-stock) {
      grid-column: 1;
      grid-row: auto;
    }

    :global(.product-modal-root .modal-dialog) {
      width: min(100% - 16px, 620px);
    }

    :global(.product-form-grid) {
      grid-template-columns: 1fr;
    }

    :global(.product-form-page .product-form-grid) {
      grid-template-columns: 1fr;
    }

    :global(.product-form-grid > [class*='col-']),
    :global(.product-form-page .product-form-grid > [class*='col-']),
    :global(.product-form-page .product-form-grid > .field),
    .product-span-2,
    .product-span-3,
    .product-grid-full,
    :global(.product-form-grid > .col-md-12) {
      grid-column: 1 / -1 !important;
    }

    .product-modal-header,
    :global(.product-modal-footer) {
      padding-inline: 16px;
    }

    :global(.product-modal-body) {
      padding: 16px;
    }

    :global(.product-modal-footer) {
      align-items: stretch;
      flex-direction: column;
    }

    .product-footer-actions {
      width: 100%;
      flex-direction: column;
    }

    .product-footer-btn {
      width: 100%;
    }

    .form-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .form-actions .btn-primary,
    .form-actions .btn-secondary,
    .form-actions .btn-neutral {
      width: 100%;
    }

    .product-form-page-shell :global(.product-form-page) {
      padding: 0;
    }

    .product-page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .product-page-header__actions {
      width: 100%;
      flex-wrap: wrap;
      justify-content: space-between;
    }

    .product-page-header__back {
      flex: 1;
      justify-content: center;
    }
  }

  .product-date-picker {
    width: 100%;
    height: var(--control-height);
    min-height: var(--control-height);
  }

  .product-date-picker :global(.persian-date-text),
  .product-date-picker :global(.input-group-text.persian-date-text) {
    display: none !important;
  }

  .product-date-picker :global(.gregorian-date-text) {
    flex: 1 1 auto;
    justify-content: flex-start;
    border-inline-end: 0;
    padding-inline: 0.75rem;
  }

  .product-date-picker :global(.gregorian-date-text),
  .product-date-picker :global(.date-picker-icon) {
    height: 100%;
    min-height: 100%;
    max-height: 100%;
  }

  :global(.product-form-page .product-date-picker) {
    height: var(--control-height);
    min-height: var(--control-height);
    border-radius: 12px;
  }

  :global(.product-form-page .product-date-picker .persian-date-text),
  :global(.product-form-page .product-date-picker .input-group-text.persian-date-text) {
    display: none !important;
  }

  :global(.product-form-page .product-date-picker .gregorian-date-text) {
    flex: 1 1 auto;
    justify-content: flex-start;
    border-inline-end: 0;
    padding-inline: 0.85rem;
  }

  :global(.product-form-page .product-date-picker .gregorian-date-text),
  :global(.product-form-page .product-date-picker .date-picker-icon) {
    height: var(--control-height);
    min-height: var(--control-height);
    max-height: var(--control-height);
  }
  /* ==========================================================================
     Product form page — every number below is traced from ProductNew.dc.html
     at 1440px: 1200px sheet, 248px summary rail, 14px cards, 28px boxes.
     ========================================================================== */
  :global(main.erp-page-main:has(#productFormPage)) {
    max-width: none;
    padding-inline: 16px;
  }

  /* Page mode only: the sheet has to reach the bottom of the route viewport, so
     every wrapper between the route and the sheet is a full-height column. The
     action bar then lands at the end of the page instead of floating right
     under the last card. shrink is 0 so a long form still scrolls as before. */
.product-form-page,
.product-form-page__body,
.product-form-page__inner,
.product-form-body {
    display: flex;
    flex-direction: column;
    flex: 1 0 auto;
    min-height: 0;
  }

.pf-page {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    /* Fills the route viewport so the action bar lands at the end of the page
       even when the cards are shorter than the screen; it never shrinks below
       its content, so a long form still scrolls the ordinary way. */
    flex: 1 0 auto;
    gap: 8px;
    color: var(--z-ink);
    font-family: var(--z-font);
  }

  /* The title block is gone: the sheet starts with its first card. Only the
     edit-mode product stepper keeps a row, and the heading stays in the
     accessibility tree so the page still has one. */
.pf-vh {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

.pf-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-inline-start: auto;
  }

.pf-iconbtn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    color: var(--z-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

.pf-iconbtn .ms {
    font-size: 18px;
  }

.pf-iconbtn:hover:not(:disabled) {
    background: var(--z-hover);
    border-color: var(--z-border-strong);
    color: var(--z-link);
  }

.pf-iconbtn:disabled {
    opacity: 0.45;
    cursor: default;
  }

.pf-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 248px;
    gap: 10px;
    align-items: start;
    /* Takes the leftover height so the action bar is pushed to the page end;
       the cards themselves stay top-aligned through align-items. */
    flex: 1 1 auto;
  }

.pf-main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

.pf-card {
    background: var(--z-surface);
    border: 1px solid var(--z-border);
    border-radius: 14px;
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

.pf-card__hd {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 6px 12px;
    border-bottom: 1px solid var(--z-border-soft);
    border-radius: 14px 14px 0 0;
    font-size: 12px;
    font-weight: 800;
    color: var(--z-ink);
  }

.pf-card__hd .ms {
    font-size: 15px;
    color: var(--z-link);
  }

.pf-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px 10px;
    padding: 8px 12px 10px;
  }

.pf-f {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    position: relative;
  }

.pf-f--2 {
    grid-column: span 2;
  }

.pf-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 18px;
    font-size: 11px;
    font-weight: 700;
    color: var(--z-text);
  }

.pf-label > label {
    cursor: default;
  }

.pf-req {
    color: var(--z-danger);
    margin-inline-start: 2px;
  }

.pf-mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 18px;
    min-width: 18px;
    padding: 0 3px;
    border: 0;
    border-radius: 5px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font: inherit;
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
  }

.pf-mini .ms {
    font-size: 13px;
  }

.pf-mini:hover {
    background: var(--z-hover);
  }

.pf-box {
    display: flex;
    align-items: center;
    height: 28px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
    min-width: 0;
    transition: border-color 0.12s, box-shadow 0.12s;
  }

.pf-box:focus-within {
    border-color: var(--z-link);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14);
  }

.pf-box input,
.pf-box select {
    flex: 1;
    width: 0;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 0 9px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--z-ink);
  }

.pf-box input[dir='ltr'],
.pf-box input[type='number'],
.pf-box input[type='date'] {
    font-family: var(--z-font-num);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
    direction: ltr;
  }

.pf-box input[type='date'] {
    /* Keeps a date control from pushing its row 2px taller than the rest. */
    height: 24px;
    line-height: 24px;
}

/*
 * The date fields swap the native control for the mounted Shamsi picker, whose
 * own input is 38px tall with a 1px border and a 10px radius. Left alone it
 * overflows the 28px box and reads as a different-sized field, so it is
 * flattened into the page skin: same height, no inner frame, same numerals.
 */
.pf-box.product-date-picker {
    height: 28px;
    min-height: 28px;
    border-radius: 7px;
    overflow: hidden;
}

.pf-box.product-date-picker :global(.legacy-app-date-picker-host) {
    display: flex;
    align-items: center;
    width: 100%;
    height: 26px;
    min-height: 0;
}

.pf-box.product-date-picker :global(.pdp),
.pf-box.product-date-picker :global(.pdp .pdp-group) {
    display: flex;
    align-items: center;
    width: 100%;
    height: 26px;
    min-height: 0;
}

/*
 * The picker's own frame: same box, same numerals, no inner border. The
 * shared date field centres its value and inlines 0.5rem of padding with
 * !important, so those two are restated here to read like the sibling
 * number fields: value flush to the right in tabular numerals.
 */
.pf-box.product-date-picker :global(.pdp .pdp-group .pdp-input) {
    height: 26px;
    min-height: 0;
    padding: 0 9px !important;
    border: 0;
    border-radius: 0 !important;
    background: transparent;
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--z-ink);
    direction: ltr;
    text-align: right !important;
}

.pf-box.product-date-picker :global(.pdp .pdp-group .pdp-input.pdp-focus) {
    /* The box already draws the focus ring. */
    box-shadow: none;
}

.pf-box input::placeholder {
    color: var(--z-subtle);
    opacity: 0.8;
    font-weight: 500;
  }

.pf-box input[type='number'] {
    -moz-appearance: textfield;
  }

.pf-box input[type='number']::-webkit-outer-spin-button,
.pf-box input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

.pf-box--btn {
    width: 100%;
    padding: 0 9px;
    font: inherit;
    font-size: 12px;
    color: var(--z-ink);
    text-align: start;
    cursor: pointer;
  }

/*
 * A picker box has to read exactly like the plain inputs beside it: white
 * fill and the same grey frame. It used to lift on hover and keep a blue ring
 * after its menu closed, which made the field look like a different control.
 * Keyboard focus is the one exception, because it has to stay visible.
 */
.pf-box--btn:hover,
.pf-box--btn:focus-within {
    background: var(--z-surface);
    border-color: var(--z-border);
    box-shadow: none;
  }

.pf-box--btn:focus-visible {
    border-color: var(--z-link);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14);
  }

.pf-box--select {
    position: relative;
  }

.pf-box--select select {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    padding-inline-end: 2px;
  }

.pf-box--select .pf-pick__caret {
    margin-inline-end: 6px;
  }

.pf-pick {
    position: relative;
  }

.pf-pick__t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

.pf-pick__t.is-empty {
    color: var(--z-subtle);
    font-weight: 500;
  }

.pf-pick__caret {
    font-size: 17px;
    color: var(--z-muted);
  }

/*
 * The panel is anchored to the field on both inline edges, so it has to be free
 * to follow the field's width. A fixed min-width made it wider than the field
 * once a column dropped below it (four columns under ~1400px), leaving the
 * panel hanging past the field's left edge.
 */
.pf-menu {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline: 0;
    z-index: 26;
    min-width: 0;
    max-width: 100%;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--z-surface);
    border: 1px solid var(--z-border);
    border-radius: 11px;
    box-shadow: 0 16px 40px -14px rgba(11, 21, 48, 0.35);
  }

.pf-menu__search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    margin-bottom: 2px;
    border: 1px solid var(--z-border-soft);
    border-radius: 7px;
    background: var(--z-surface-2);
    color: var(--z-subtle);
  }

.pf-menu__search .ms {
    font-size: 16px;
  }

.pf-menu__search input {
    flex: 1;
    width: 0;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 12px;
    color: var(--z-ink);
  }

.pf-menu__list {
    max-height: 216px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

.pf-menu__opt {
    width: 100%;
    min-height: 28px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    font-size: 11.5px;
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }

.pf-menu__opt:hover {
    background: var(--z-hover);
  }

.pf-menu__opt.is-on {
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-weight: 700;
  }

.pf-menu__opt .ms {
    font-size: 16px;
  }

.pf-menu__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

.pf-menu__empty {
    padding: 10px 8px;
    font-size: 11.5px;
    color: var(--z-subtle);
    text-align: center;
  }

.pf-menu__clear {
    min-height: 30px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-top: 1px solid var(--z-border-soft);
    background: transparent;
    color: var(--z-muted);
    font: inherit;
    font-size: 11.5px;
    text-align: start;
    cursor: pointer;
  }

.pf-menu__clear .ms {
    font-size: 16px;
  }

.pf-menu__clear:hover {
    color: var(--z-ink);
  }

  /* Currency suffix + its popover (reference `sufS`) */
.pf-cur {
    display: flex;
    flex-shrink: 0;
  }

.pf-cur__btn {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 20px;
    padding: 0 7px;
    margin-inline-end: 4px;
    border: 0;
    border-radius: 6px;
    background: var(--z-surface-3);
    color: var(--z-text);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

.pf-cur__btn > span[dir='ltr'] {
    font-family: var(--z-font-num);
  }

.pf-cur__btn .ms {
    font-size: 14px;
    color: var(--z-muted);
  }

.pf-cur__btn:hover {
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

/* The popover hangs off the field, not the little symbol chip, so its right
   edge lines up with the box. */
.pf-box--cur {
    position: relative;
  }

/*
 * Currency picker, laid out like the Sale form's `sf-cumenu`: a search row, then
 * one row per currency with the symbol in a soft chip, the name over its rate,
 * the ISO code and a check that only the selected row shows.
 */
.pf-cumenu {
    position: absolute;
    top: 32px;
    inset-inline-start: 0;
    z-index: 27;
    width: 248px;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid var(--z-border);
    border-radius: 12px;
    background: var(--z-surface);
    box-shadow: 0 18px 40px -14px rgba(11, 21, 48, 0.35);
  }

.pf-cumenu__search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin: 6px;
    padding: 0 9px;
    border: 1px solid var(--z-border-soft);
    border-radius: 8px;
    background: var(--z-surface-2);
    color: var(--z-muted);
  }

.pf-cumenu__search .ms {
    font-size: 16px;
  }

.pf-cumenu__search input {
    flex: 1;
    width: 0;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-family: inherit;
    font-size: 11.5px;
  }

.pf-cumenu__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 220px;
    overflow-y: auto;
    padding: 0 6px 6px;
  }

.pf-cumenu__opt {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 4px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    font-size: 12px;
    text-align: start;
    cursor: pointer;
  }

.pf-cumenu__opt:hover {
    background: var(--z-surface-2);
  }

.pf-cumenu__opt.is-on {
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

.pf-cumenu__chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 8px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 800;
  }

.pf-cumenu__opt.is-base .pf-cumenu__chip {
    background: var(--z-surface-3);
    color: var(--z-muted);
  }

.pf-cumenu__cpy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

.pf-cumenu__name {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

.pf-cumenu__opt.is-on .pf-cumenu__name {
    color: var(--z-link);
    font-weight: 700;
  }

.pf-cumenu__rate {
    color: var(--z-muted);
    font-family: var(--z-font-num);
    font-size: 10px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

.pf-cumenu__code {
    color: var(--z-subtle);
    font-family: var(--z-font-num);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

.pf-cumenu__check {
    color: var(--z-link);
    font-size: 17px;
    visibility: hidden;
  }

.pf-cumenu__opt.is-on .pf-cumenu__check {
    visibility: visible;
  }

  /* Percent / value switcher inside the sell box (reference `segS`) */
.pf-seg {
    display: flex;
    flex-shrink: 0;
    gap: 1px;
    padding: 2px;
    margin-inline-end: 4px;
    border-radius: 6px;
    background: var(--z-surface-3);
  }

.pf-seg button {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 18px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--z-muted);
    font: inherit;
    font-size: 10.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

/* The currency side of the switch carries the symbol and a caret; the percent
   side is the glyph alone, so it does not need the extra room. */
.pf-seg__pick {
    padding-inline: 6px 4px;
  }

.pf-seg button .ms {
    font-size: 13px;
    color: var(--z-muted);
  }

.pf-seg button.is-on .ms {
    color: var(--z-ink);
  }

.pf-seg button.is-on {
    background: var(--z-surface);
    color: var(--z-ink);
    font-weight: 800;
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.18);
  }

.pf-hint {
    flex-shrink: 0;
    margin-inline-end: 6px;
    font-family: var(--z-font-num);
    font-size: 11px;
    font-weight: 700;
    color: var(--z-ok);
    white-space: nowrap;
  }

.pf-hint.is-neg {
    color: var(--z-danger);
  }

.pf-suffix {
    flex-shrink: 0;
    margin-inline-end: 8px;
    font-size: 11px;
    font-weight: 700;
    color: var(--z-muted);
    white-space: nowrap;
  }

.pf-textarea {
    width: 100%;
    min-height: 30px;
    height: 30px;
    resize: vertical;
    padding: 7px 9px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    font: inherit;
    font-size: 12px;
    line-height: 1.6;
    color: var(--z-ink);
    box-sizing: border-box;
    outline: 0;
    transition: border-color 0.12s, box-shadow 0.12s;
  }

.pf-textarea::placeholder {
    color: var(--z-subtle);
    opacity: 0.8;
    font-weight: 500;
  }

.pf-textarea:focus {
    border-color: var(--z-link);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14);
  }

  /* Drop zone / picked thumbnail */
.pf-drop {
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1.5px dashed var(--z-border-strong);
    border-radius: 8px;
    background: var(--z-surface-2);
    font-size: 12px;
    font-weight: 700;
    color: var(--z-link);
    cursor: pointer;
  }

.pf-drop .ms {
    font-size: 18px;
  }

.pf-drop:hover {
    border-color: var(--z-link);
    background: var(--z-brand-soft);
  }

.pf-drop:focus-within {
    outline: 2px solid var(--z-link);
    outline-offset: 2px;
  }

.pf-image {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    box-sizing: border-box;
  }

.pf-image img {
    width: 24px;
    height: 24px;
    object-fit: cover;
    border-radius: 4px;
    background: var(--z-surface-3);
  }

.pf-image__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: ltr;
    text-align: right;
    font-size: 11px;
    color: var(--z-muted);
  }

.pf-image__swap,
.pf-image__del {
    position: relative;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }

.pf-image__swap {
    color: var(--z-link);
  }

.pf-image__del {
    color: var(--z-danger);
  }

.pf-image__swap:hover,
.pf-image__del:hover {
    background: var(--z-surface-3);
  }

.pf-image__swap .ms,
.pf-image__del .ms {
    font-size: 17px;
  }

.pf-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

.pf-mini--image {
    max-width: 96px;
    overflow: hidden;
    white-space: nowrap;
  }

.pf-mini:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ===== Summary rail (sticky, 248px) =====
     The sticky inset is zero on purpose: the page scroller already pads its own
     top by 10px, and a non-zero inset counted that padding twice, leaving the
     rail 10px lower than the first card of the main column. */
.pf-side {
    position: sticky;
    top: 0;
    align-self: start;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--z-surface);
    border: 1px solid var(--z-border);
    border-radius: 14px;
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04), 0 10px 28px -18px rgba(11, 21, 48, 0.35);
  }

.pf-side__hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 7px 12px;
  }

.pf-side__hd h3 {
    margin: 0;
    font-size: 11.5px;
    font-weight: 800;
    color: var(--z-muted);
  }

.pf-state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 700;
    background: var(--z-warn-soft);
    color: var(--z-warn);
  }

.pf-state .ms {
    font-size: 13px;
  }

.pf-state--ok {
    background: var(--z-ok-soft);
    color: var(--z-ok);
  }

.pf-progress {
    display: block;
    height: 3px;
    background: var(--z-surface-3);
  }

.pf-progress > span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--z-brand);
    transition: width 0.2s;
  }

.pf-prev {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
  }

.pf-prev__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

.pf-prev__name {
    font-family: var(--z-font-num);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.35;
    overflow-wrap: anywhere;
    text-align: right;
    color: var(--z-ink);
  }

.pf-prev__name.is-empty {
    color: var(--z-subtle);
  }

.pf-prev__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

.pf-chip {
    height: 18px;
    display: inline-flex;
    align-items: center;
    padding: 0 6px;
    border-radius: 5px;
    background: var(--z-surface-3);
    color: var(--z-text);
    font-size: 10.5px;
    font-weight: 700;
  }

.pf-chip--code {
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-family: var(--z-font-num);
  }

.pf-side__money {
    margin: 0 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--z-border-soft);
    border-radius: 11px;
    background: linear-gradient(135deg, var(--z-brand-soft), var(--z-surface-2) 75%);
  }

.pf-side__prices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

.pf-side__prices > div {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

.pf-side__prices span {
    font-size: 10.5px;
    color: var(--z-muted);
  }

.pf-side__prices b {
    font-family: var(--z-font-num);
    font-size: 15px;
    font-weight: 800;
    color: var(--z-ink);
    text-align: right;
    white-space: nowrap;
  }

.pf-side__prices > div:last-child b {
    color: var(--z-link);
  }

.pf-side__prices em {
    font-style: normal;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--z-muted);
  }

.pf-side__bar {
    display: block;
    height: 5px;
    border-radius: 999px;
    background: var(--z-surface-3);
    overflow: hidden;
  }

.pf-side__fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--z-brand);
    transition: width 0.2s;
  }

.pf-side__fill.is-neg {
    background: var(--z-danger);
  }

.pf-side__profit {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    font-size: 11px;
    color: var(--z-muted);
  }

.pf-side__profit b {
    font-family: var(--z-font-num);
    color: var(--z-ink);
  }

.pf-side__margin {
    font-family: var(--z-font-num);
    font-size: 12.5px;
    font-weight: 800;
    color: var(--z-ok);
  }

.pf-side__margin.is-neg {
    color: var(--z-danger);
  }

.pf-side__facts {
    margin: 0;
    padding: 10px 12px 4px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 10px;
    align-items: baseline;
    font-size: 11.5px;
  }

.pf-side__facts dt {
    color: var(--z-muted);
  }

.pf-side__facts dd {
    margin: 0;
    font-weight: 700;
    color: var(--z-ink);
    text-align: left;
    overflow-wrap: anywhere;
  }

.pf-side__stock {
    margin: 6px 12px 12px;
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--z-border-soft);
    border-radius: 11px;
  }

.pf-side__wh {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--z-muted);
  }

.pf-side__wh .ms {
    font-size: 15px;
  }

.pf-side__wh span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

.pf-side__stockrow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

.pf-side__stockrow b {
    font-size: 13px;
    font-weight: 800;
    color: var(--z-ink);
    white-space: nowrap;
  }

.pf-side__stockrow em {
    font-style: normal;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--z-muted);
  }

.pf-side__stockrow > span {
    font-family: var(--z-font-num);
    font-size: 11px;
    font-weight: 700;
    color: var(--z-muted);
    white-space: nowrap;
  }

.pf-side__foot {
    display: flex;
    gap: 10px;
    padding-top: 6px;
    border-top: 1px dashed var(--z-border-soft);
    font-size: 10.5px;
    color: var(--z-subtle);
  }

.pf-side__foot > span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

.pf-side__foot .ms {
    font-size: 13px;
  }

.pf-side__foot b {
    font-family: var(--z-font-num);
    color: var(--z-text);
  }

  /* ===== Action bar ===== */
.pf-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 2px;
  }

.pf-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

.pf-btn .ms {
    font-size: 17px;
  }

.pf-btn--ghost {
    border: 1px solid var(--z-border);
    background: var(--z-surface);
    color: var(--z-text);
  }

.pf-btn--ghost:hover {
    background: var(--z-surface-3);
    color: var(--z-ink);
  }

.pf-bar__cancel {
    margin-inline-end: auto;
  }

.pf-btn--outline {
    border: 1px solid var(--z-link);
    background: var(--z-surface);
    color: var(--z-link);
  }

.pf-btn--outline:hover:not(:disabled) {
    background: var(--z-brand-soft);
  }

.pf-btn--primary {
    border: 0;
    background: var(--z-brand);
    color: #ffffff;
    box-shadow: 0 8px 18px -8px rgba(47, 111, 237, 0.9);
  }

.pf-btn--primary:hover {
    background: #245fcf;
  }

.pf-btn:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

@media (max-width: 1180px) {
.pf-layout {
      grid-template-columns: minmax(0, 1fr);
    }

.pf-side {
      position: static;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
}

@media (max-width: 1100px) {
.pf-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 767px) {
.pf-grid {
      grid-template-columns: minmax(0, 1fr);
    }

.pf-f--2 {
      grid-column: auto;
    }

.pf-side {
      grid-template-columns: minmax(0, 1fr);
    }

.pf-bar__cancel {
      display: none;
    }

.pf-bar .pf-btn--outline,
.pf-bar .pf-btn--primary {
      flex: 1;
    }
}

  /* Dark theme only needs the hard-coded shadows softened; every colour above
     resolves through the global --z-* tokens, so it flips on its own. */
  :global(html.dark) .pf-card,
  :global(html.dark) .pf-side {
    box-shadow: none;
  }

  :global(html.dark) .pf-btn--primary {
    box-shadow: 0 8px 18px -10px rgba(47, 111, 237, 0.6);
  }
</style>