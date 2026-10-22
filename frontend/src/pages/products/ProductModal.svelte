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

  function searchImageOnGoogle() {
    const query = name?.trim();
    if (!query) {
      toast.error(t('Error'), t('Please enter product name first'));
      return;
    }

    const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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

    if (!name.trim()) {
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
            name: name.trim(),
            code: productCode,
            product_status: product_status,
            percentage: Number(percentage) || 0,
            description,
            buy_price: parseFloat(buy_price) || 0,
            buy_currency: buy_currency,
            currency: currency.trim(),
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
            name: name.trim(),
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
            currency: currency,
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
          name: name.trim(),
          code: productCode,
          percentage: Number(percentage) || 0,
          description,
          product_status: product_status,
          buy_price: parseFloat(buy_price) || 0,
          buy_currency: buy_currency,
          currency: currency,
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
      </div>
      <div class={asPage ? 'form-actions' : 'modal-footer product-modal-footer'}>
        {#if asPage}
          {#if editingId}
            <div class="product-neighbor-actions">
              <button
                type="button"
                class="btn-neutral product-neighbor-btn"
                disabled={!previousProductId}
                on:click={() => navigateProductNeighbor(previousProductId)}>
                <i class="bi bi-chevron-right"></i>
                {t('Previous')}
              </button>
              <button
                type="button"
                class="btn-neutral product-neighbor-btn"
                disabled={!nextProductId}
                on:click={() => navigateProductNeighbor(nextProductId)}>
                {t('Next')}
                <i class="bi bi-chevron-left"></i>
              </button>
            </div>
          {/if}
          <button type="button" class="btn-primary" on:click={() => saveProduct()}>
            {#if type == 'service'}
              {editingId ? t('Update Service') : t('Save Service')}
            {:else}
              {editingId ? t('Update Product') : t('Save Product')}
            {/if}
          </button>
          <button
            type="button"
            class="btn-secondary"
            disabled={editingId && !nextProductId && !previousProductId}
            on:click={() => saveProduct(editingId ? 'edit-another' : 'again')}>
            {#if type == 'service'}
              {editingId ? 'ویرایش خدمت و ویرایش خدمت دیگر' : t('Save Service and Add Another')}
            {:else}
              {editingId ? 'ویرایش محصول و ویرایش محصول دیگر' : t('Save Product and Add Another')}
            {/if}
          </button>
          <button type="button" class="btn-neutral" on:click={closeProductForm}>
            {t('Cancel')}
          </button>
        {:else if type == 'service'}
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
</style>