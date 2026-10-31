<script>
    import { onMount } from "svelte";
    import { currencyApi } from "../../api/currencyApi.js";

    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import { showDate } from "../../calendar.js";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
    import PaginationBar from "../../components/common/PaginationBar.svelte";
    import DataTable from "../../components/common/DataTable.svelte";
    import StatusBadge from "../../components/common/StatusBadge.svelte";
    import TableActions from "../../components/common/TableActions.svelte";
    import EmptyState from "../../components/common/EmptyState.svelte";
    import { DEFAULT_PAGE_SIZE } from "../../lib/pagination.js";

    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    let currencies = [];
    let loading = true;
    let saving = false;
    let currencyModal;

    let currentPage = 1;
    let itemsPerPage = DEFAULT_PAGE_SIZE;

    // Main currency form fields
    let editingId = null;
    let originalCurrency = null;
    let name = "";
    let code = "";
    let symbol = "";
    let rate = 1;
    let rateDate = getToday();
    let isDefault = false;

    // Used only while editing the default/base currency.
    // Always quoted as foreign → AFN when AFN exists:
    //   1 USD = 64 AFN, 1 EUR = 75 AFN
    // If AFN is selected while EUR is default, UI still shows 1 EUR = X AFN
    // and stores AFN rate as 1/X.
    let selectedRateCurrencyId = "";
    let selectedRate = "";
    let selectedRateQuote = emptyRateQuote();

    // Extra exchange rate row (edit mode) — updates another currency's rate
    // against the current base currency.
    let showExtraRateRow = false;
    let extraCurrencyId = "";
    let extraRate = "";
    let extraRateQuote = emptyRateQuote();

    // Main non-default rate quote metadata (foreign → AFN when possible).
    let mainRateQuote = emptyRateQuote();

    $: activeCurrencies = currencies.filter(
        (currency) => currency.status === undefined || currency.status !== 0,
    );

    $: defaultCurrency =
        activeCurrencies.find((currency) => Number(currency.isDefault) === 1) ||
        null;

    $: selectedRateCurrency =
        activeCurrencies.find(
            (currency) =>
                String(currency.id) === String(selectedRateCurrencyId),
        ) || null;

    $: otherCurrencies = activeCurrencies.filter(
        (currency) =>
            String(currency.id) !== String(editingId) &&
            String(currency.id) !== String(extraCurrencyId),
    );

    $: modalBaseCode = String(
        isDefault
            ? code || originalCurrency?.code || ""
            : defaultCurrency?.code || "",
    )
        .trim()
        .toUpperCase();

    // Currencies available for the extra rate row: any active currency other
    // than the one being edited, the base currency, and the currency already
    // selected in the main selected-rate row.
    $: extraCurrencies = activeCurrencies.filter(
        (currency) =>
            String(currency.id) !== String(editingId) &&
            String(currency.id) !== String(defaultCurrency?.id) &&
            String(currency.id) !== String(selectedRateCurrencyId),
    );

    $: extraRateCurrency =
        extraCurrencies.find(
            (currency) =>
                String(currency.id) === String(extraCurrencyId),
        ) || null;

    $: editedCurrencyCode = String(code || "").trim().toUpperCase();

    $: afnCurrency =
        activeCurrencies.find((currency) => isAfnCode(currency.code)) || null;

    $: filteredCurrencies = activeCurrencies.slice();
    $: totalPages = Math.ceil(filteredCurrencies.length / itemsPerPage);
    $: if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    }
    $: paginatedCurrencies = filteredCurrencies.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
    );

    function getToday() {
        return new Date().toISOString().split("T")[0];
    }

    function emptyRateQuote(leftCode = "", rightCode = "") {
        return {
            leftCode,
            rightCode,
            invertOnSave: false,
            multiplyByAfn: null,
        };
    }

    function isAfnCode(code) {
        return String(code || "").trim().toUpperCase() === "AFN";
    }

    function toPositiveNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    // Table rate formatter:
    // - 1 becomes 1.00
    // - 40 becomes 40.00
    // - 0.0002 stays 0.0002 instead of being rounded to 0.00
    function formatExchangeRate(value) {
        const number = Number(value);

        if (!Number.isFinite(number) || number < 0) {
            return "0.00";
        }

        if (number === 0) {
            return "0.00";
        }

        return number.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: Math.abs(number) < 1 ? 8 : 2,
            useGrouping: true,
        });
    }

    function roundRate(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) return "";

        return Number(number.toFixed(8));
    }

    /*
     * Prefer quoting every rate as: 1 foreign = X AFN
     *
     * Examples:
     *   AFN default + USD stored 64     → 1 USD = 64 AFN
     *   EUR default + AFN stored 0.0133 → 1 EUR = 75 AFN  (save as 1/75)
     *   EUR default + USD stored 0.85   → 1 USD = (0.85 / AFN_rate) AFN
     */
    function prepareQuotedDisplay(
        storedVsBase,
        selectedCode,
        baseCode,
        { usePendingAfn = false } = {},
    ) {
        const selected = String(selectedCode || "").trim().toUpperCase();
        const base = String(baseCode || "").trim().toUpperCase();
        const stored = toPositiveNumber(storedVsBase);

        if (!stored) {
            return {
                displayRate: "",
                ...emptyRateQuote(selected || "---", base || "AFN"),
            };
        }

        if (isAfnCode(base)) {
            return {
                displayRate: roundRate(stored),
                ...emptyRateQuote(selected, "AFN"),
            };
        }

        if (isAfnCode(selected)) {
            return {
                displayRate: roundRate(1 / stored),
                leftCode: base || "---",
                rightCode: "AFN",
                invertOnSave: true,
                multiplyByAfn: null,
            };
        }

        const afnStoredVsBase = usePendingAfn
            ? getPendingSelectedStoredRate(afnCurrency)
            : toPositiveNumber(afnCurrency?.exchangeRate);

        if (afnStoredVsBase) {
            return {
                displayRate: roundRate(stored / afnStoredVsBase),
                leftCode: selected || "---",
                rightCode: "AFN",
                invertOnSave: false,
                multiplyByAfn: afnStoredVsBase,
            };
        }

        return {
            displayRate: roundRate(stored),
            ...emptyRateQuote(selected || "---", base || "---"),
        };
    }

    function storedFromQuotedDisplay(displayValue, quote) {
        const display = toPositiveNumber(displayValue);

        if (!display) return null;

        if (quote?.invertOnSave) {
            return 1 / display;
        }

        if (quote?.multiplyByAfn) {
            return display * quote.multiplyByAfn;
        }

        return display;
    }

    function isSameId(firstId, secondId) {
        return String(firstId) === String(secondId);
    }

    function buildCurrencyPayload(currency, overrides = {}) {
        return {
            name: currency.name,
            code: currency.code,
            symbol: currency.symbol ?? "",
            isDefault: Number(currency.isDefault) === 1 ? 1 : 0,
            exchangeRate: Number(currency.exchangeRate) || 1,
            exchangeRateDate: currency.exchangeRateDate || getToday(),
            status: currency.status === undefined ? 1 : Number(currency.status),
            ...overrides,
        };
    }

    function prepareMainRate(storedRate, selectedCode = editedCurrencyCode) {
        const baseCode = String(defaultCurrency?.code || "")
            .trim()
            .toUpperCase();
        const quoted = prepareQuotedDisplay(
            storedRate,
            selectedCode,
            baseCode,
            { usePendingAfn: true },
        );

        mainRateQuote = quoted;
        rate = quoted.displayRate;
    }

    function getMainStoredRate() {
        return storedFromQuotedDisplay(rate, mainRateQuote);
    }

    function getExtraStoredRate() {
        return storedFromQuotedDisplay(extraRate, extraRateQuote);
    }

    // Auto-fill the extra rate from the picked currency's current stored rate,
    // converted to the pending base when the default is changing.
    function handleExtraRateCurrencyChange() {
        const currency =
            activeCurrencies.find(
                (item) => String(item.id) === String(extraCurrencyId),
            ) || null;
        const pendingStoredRate = getPendingSelectedStoredRate(currency);
        const baseCode = String(
            isDefault ? modalBaseCode : defaultCurrency?.code || "",
        )
            .trim()
            .toUpperCase();
        const quoted = prepareQuotedDisplay(
            pendingStoredRate,
            currency?.code,
            baseCode,
            { usePendingAfn: true },
        );

        extraRateQuote = quoted;
        extraRate = quoted.displayRate;
    }

    function getPendingSelectedStoredRate(currency) {
        const selectedOldRate = toPositiveNumber(currency?.exchangeRate);

        if (!selectedOldRate) return null;

        /*
         * Rates are stored relative to the current default currency.
         * When another currency is being made default, calculate the selected
         * currency's rate against that pending base.
         *
         * Example before changing the base:
         *   AFN default: AFN = 1, USD = 64
         *
         * While USD is being made default and EUR is selected:
         *   pending EUR stored rate = oldEurRate / oldUsdRate
         */
        const currentDefaultIsStillBase =
            defaultCurrency && isSameId(defaultCurrency.id, editingId);

        if (!isDefault || !editingId || currentDefaultIsStillBase) {
            return selectedOldRate;
        }

        const pendingBaseOldRate = toPositiveNumber(
            originalCurrency?.exchangeRate,
        );

        if (!pendingBaseOldRate) return null;

        return selectedOldRate / pendingBaseOldRate;
    }

    function getSelectedStoredRate() {
        return storedFromQuotedDisplay(selectedRate, selectedRateQuote);
    }

    async function loadCurrencies() {
        loading = true;

        try {
            const response = await currencyApi.getAll({ status: 1 });
            currencies = response?.data || [];
        } catch (error) {
            console.error("Failed to load currencies:", error);
            currencies = [];
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const modalElement = document.getElementById("createCurrencyModal");

        if (window.mdb && modalElement) {
            currencyModal = new window.mdb.Modal(modalElement);
        }

        loadCurrencies();
    });

    async function openCurrencyModal() {
        editingId = null;
        originalCurrency = null;
        name = "";
        code = "";
        symbol = "";
        rateDate = getToday();
        isDefault = activeCurrencies.length === 0;
        selectedRateCurrencyId = "";
        selectedRate = "";
        selectedRateQuote = emptyRateQuote();
        resetExtraRateRow();

        if (isDefault) {
            rate = 1;
            mainRateQuote = emptyRateQuote("AFN", "AFN");
        } else {
            const baseCode = String(defaultCurrency?.code || "")
                .trim()
                .toUpperCase();

            if (isAfnCode(baseCode)) {
                mainRateQuote = emptyRateQuote("", "AFN");
                rate = 1;
            } else if (afnCurrency) {
                const afnStored = toPositiveNumber(afnCurrency.exchangeRate);
                mainRateQuote = {
                    leftCode: "",
                    rightCode: "AFN",
                    invertOnSave: false,
                    multiplyByAfn: afnStored,
                };
                rate = "";
            } else {
                mainRateQuote = emptyRateQuote("", baseCode || "---");
                rate = 1;
            }
        }

        currencyModal?.show();
    }

    async function editCurrency(currency) {
        editingId = currency.id;
        originalCurrency = { ...currency };
        name = currency.name || "";
        code = currency.code || "";
        symbol = currency.symbol || "";
        isDefault = Number(currency.isDefault) === 1;

        if (isDefault) {
            rate = 1;
            mainRateQuote = emptyRateQuote(currency.code, "AFN");
        } else {
            prepareMainRate(currency.exchangeRate, currency.code);
        }

        rateDate = currency.exchangeRateDate || getToday();
        selectedRateCurrencyId = "";
        selectedRate = "";
        selectedRateQuote = emptyRateQuote();

        resetExtraRateRow();

        currencyModal?.show();
    }

    function handleDefaultToggle() {
        selectedRateCurrencyId = "";
        selectedRate = "";
        selectedRateQuote = emptyRateQuote();
        resetExtraRateRow();

        if (isDefault) {
            rate = 1;
            mainRateQuote = emptyRateQuote(editedCurrencyCode, "AFN");
        } else if (originalCurrency) {
            prepareMainRate(originalCurrency.exchangeRate, originalCurrency.code);
        } else {
            rate = 1;
            mainRateQuote = emptyRateQuote(
                editedCurrencyCode,
                defaultCurrency?.code || "AFN",
            );
        }
    }

    function handleRateCurrencyChange() {
        const currency =
            activeCurrencies.find(
                (item) => String(item.id) === String(selectedRateCurrencyId),
            ) || null;
        const pendingStoredRate = getPendingSelectedStoredRate(currency);
        const quoted = prepareQuotedDisplay(
            pendingStoredRate,
            currency?.code,
            modalBaseCode,
            { usePendingAfn: true },
        );

        // Always quote as foreign → AFN when possible:
        //   1 USD = 64 AFN, 1 EUR = 75 AFN
        selectedRateQuote = quoted;
        selectedRate = quoted.displayRate;
    }

    function toggleExtraRateRow() {
        showExtraRateRow = !showExtraRateRow;
    }

    function resetExtraRateRow() {
        showExtraRateRow = false;
        extraCurrencyId = "";
        extraRate = "";
        extraRateQuote = emptyRateQuote();
    }

    async function saveCurrency() {
        const normalizedName = name.trim();
        const normalizedCode = code.trim().toUpperCase();
        const normalizedSymbol = symbol.trim();
        const normalRate = isDefault ? 1 : getMainStoredRate();
        const selectedStoredRate = getSelectedStoredRate();
        const extraStoredRate = getExtraStoredRate();

        if (!normalizedName || !normalizedCode) {
            alert(t("Name and code are required."));
            return;
        }

        if (!isDefault && !normalRate) {
            alert(t("Exchange rate must be greater than zero."));
            return;
        }

        if (isDefault && selectedRateCurrencyId && !selectedStoredRate) {
            alert(
                t(
                    "The selected currency exchange rate must be greater than zero.",
                ),
            );
            return;
        }

        if (extraCurrencyId && !extraStoredRate) {
            alert(
                t(
                    "The extra currency exchange rate must be greater than zero.",
                ),
            );
            return;
        }

        let activeBeforeSave = [];
        let previousDefault = null;
        let oldCurrency = null;

        try {
            const listResponse = await currencyApi.getAll({ status: 1 });
            activeBeforeSave = listResponse?.data || [];

            previousDefault =
                activeBeforeSave.find(
                    (currency) => Number(currency.isDefault) === 1,
                ) || null;

            oldCurrency = editingId
                ? activeBeforeSave.find((currency) =>
                      isSameId(currency.id, editingId),
                  ) || originalCurrency
                : null;
        } catch (error) {
            console.error("Currency preload error:", error);
            alert(error?.message || t("Failed to save currency"));
            return;
        }

        /*
         * The current default cannot simply be unchecked because the system
         * must always have one base currency. Set another currency as default
         * first instead.
         */
        if (Number(oldCurrency?.isDefault) === 1 && !isDefault) {
            alert(
                t(
                    "Set another currency as default before removing this default currency.",
                ),
            );
            return;
        }

        /*
         * When a default already exists, create the new currency first with
         * its rate, then edit it and set it as default. This guarantees that
         * all existing rates can be converted correctly.
         */
        if (!editingId && isDefault && previousDefault) {
            alert(
                t(
                    "Create this currency first with its exchange rate, then edit it and set it as default.",
                ),
            );
            return;
        }

        saving = true;

        try {
            const exchangeRateDate = getToday();
            let savedCurrencyId = editingId;

            const mainPayload = {
                name: normalizedName,
                code: normalizedCode,
                symbol: normalizedSymbol,
                isDefault: isDefault ? 1 : 0,
                exchangeRate: isDefault ? 1 : normalRate,
                exchangeRateDate,
                status: 1,
            };

            if (editingId) {
                await currencyApi.update(editingId, mainPayload);
            } else {
                const created = await currencyApi.create(mainPayload);
                savedCurrencyId = created?.data?.id || created?.id;
            }

            if (!savedCurrencyId) {
                throw new Error(t("Failed to save currency"));
            }

            if (isDefault) {
                const defaultChanged =
                    previousDefault &&
                    !isSameId(previousDefault.id, savedCurrencyId);

                if (defaultChanged) {
                    /*
                     * Existing values are stored as:
                     *     1 currency = exchangeRate × old default currency
                     *
                     * To change the base automatically:
                     *     newRate = oldRate / newBaseOldRate
                     *
                     * Example before changing base:
                     *     1 USD = 64 AFN
                     *     1 EUR = 75 AFN
                     *
                     * If USD becomes default:
                     *     1 AFN = 1 / 64 USD
                     *     1 EUR = 75 / 64 USD
                     */
                    const newBaseOldRate = toPositiveNumber(
                        oldCurrency?.exchangeRate,
                    );

                    if (!newBaseOldRate) {
                        throw new Error(
                            t(
                                "The new default currency needs a valid previous exchange rate.",
                            ),
                        );
                    }

                    for (const currency of activeBeforeSave) {
                        const oldRate = toPositiveNumber(currency.exchangeRate);

                        if (!oldRate) {
                            throw new Error(
                                t("Currency {code} has an invalid exchange rate.").replace(
                                    "{code}",
                                    currency.code,
                                ),
                            );
                        }

                        const convertedRate = isSameId(
                            currency.id,
                            savedCurrencyId,
                        )
                            ? 1
                            : Number((oldRate / newBaseOldRate).toFixed(8));

                        await currencyApi.update(
                            currency.id,
                            buildCurrencyPayload(currency, {
                                name: isSameId(currency.id, savedCurrencyId)
                                    ? normalizedName
                                    : currency.name,
                                code: isSameId(currency.id, savedCurrencyId)
                                    ? normalizedCode
                                    : currency.code,
                                symbol: isSameId(currency.id, savedCurrencyId)
                                    ? normalizedSymbol
                                    : currency.symbol,
                                isDefault: isSameId(currency.id, savedCurrencyId)
                                    ? 1
                                    : 0,
                                exchangeRate: convertedRate,
                                exchangeRateDate,
                                status: 1,
                            }),
                        );
                    }
                } else {
                    // Keep exactly one default currency and keep its rate fixed at 1.
                    for (const currency of activeBeforeSave) {
                        if (
                            Number(currency.isDefault) === 1 &&
                            !isSameId(currency.id, savedCurrencyId)
                        ) {
                            await currencyApi.update(
                                currency.id,
                                buildCurrencyPayload(currency, {
                                    isDefault: 0,
                                }),
                            );
                        }
                    }

                    await currencyApi.update(
                        savedCurrencyId,
                        buildCurrencyPayload(
                            {
                                name: normalizedName,
                                code: normalizedCode,
                                symbol: normalizedSymbol,
                                isDefault: 1,
                                exchangeRate: 1,
                                exchangeRateDate,
                                status: 1,
                            },
                            {},
                        ),
                    );
                }

                /*
                 * The popup may show either direction, but the API always
                 * stores: 1 selected currency = exchangeRate × base currency.
                 *
                 * AFN base + USD selected:
                 *     popup: 1 USD = 64 AFN
                 *     stored USD rate: 64
                 *
                 * USD base + AFN selected:
                 *     popup: 1 USD = 64 AFN
                 *     stored AFN rate: 1 / 64
                 */
                if (
                    selectedRateCurrency &&
                    !isSameId(selectedRateCurrency.id, savedCurrencyId) &&
                    selectedStoredRate
                ) {
                    await currencyApi.update(
                        selectedRateCurrency.id,
                        buildCurrencyPayload(selectedRateCurrency, {
                            isDefault: 0,
                            exchangeRate: selectedStoredRate,
                            exchangeRateDate,
                            status: 1,
                        }),
                    );
                }
            }

            // The extra rate row writes another currency's rate against the
            // current base currency, exactly like the main rate does for the
            // currency being edited.
            if (
                extraRateCurrency &&
                !isSameId(extraRateCurrency.id, savedCurrencyId) &&
                extraStoredRate
            ) {
                await currencyApi.update(
                    extraRateCurrency.id,
                    buildCurrencyPayload(extraRateCurrency, {
                        isDefault: 0,
                        exchangeRate: extraStoredRate,
                        exchangeRateDate,
                        status: 1,
                    }),
                );
            }

            await loadCurrencies();
            currencyModal?.hide();
        } catch (error) {
            console.error("Currency save error:", error);
            alert(
                "Error: " +
                    (error?.message || t("Failed to save currency")),
            );
        } finally {
            saving = false;
        }
    }

    async function deleteCurrency(id) {
        try {
            const response = await currencyApi.getById(id);
            const currency = response?.data;

            if (!currency) return;

            if (Number(currency.isDefault) === 1) {
                alert(t("The default currency cannot be deleted."));
                return;
            }

            if (!confirm(t("Delete this currency?"))) return;

            await currencyApi.remove(id);
            await loadCurrencies();
        } catch (error) {
            console.error("Delete failed:", error);
            alert(error?.message || t("Failed to delete currency"));
        }
    }

    function getPageNumbers(current, total) {
        const range = [];
        const compact = [];
        let previous;

        for (let page = 1; page <= total; page += 1) {
            if (
                page === 1 ||
                page === total ||
                (page >= current - 2 && page <= current + 2)
            ) {
                range.push(page);
            }
        }

        for (const page of range) {
            if (previous && page - previous > 1) {
                compact.push(page - previous === 2 ? previous + 1 : "...");
            }

            compact.push(page);
            previous = page;
        }

        return compact;
    }
</script>

<div class="currencies-page-actions">
    <ActionButton
        icon="bi-plus-lg"
        label={`+ ${t("Create Currency")}`}
        on:click={openCurrencyModal}
    />
</div>

<IndexPageLayout
    dir={t("dir")}
    ariaLabel={t("Currencies")}
    showFooter={!loading && filteredCurrencies.length > 0}
    dense={true}
    contained={true}
    contentClass="currencies-index-content"
    tablePadding={true}
>
    {#if loading}
        <div class="index-table-state">
            <EmptyState loading message={t("Loading...")} />
        </div>
    {:else if filteredCurrencies.length === 0}
        <div class="index-table-state">
            <EmptyState
                icon="bi-currency-exchange"
                message={t("No currencies found.")}
            />
        </div>
    {:else}
        <DataTable ariaLabel={t("Currencies")} minWidth="760px">
            <svelte:fragment slot="head">
                <tr>
                    <th>{t("Name")}</th>
                    <th>{t("Code")}</th>
                    <th>{t("Symbol")}</th>
                    <th class="col-end">{t("Rate")}</th>
                    <th>{t("Rate Date")}</th>
                    <th class="col-end">{t("Actions")}</th>
                </tr>
            </svelte:fragment>

            {#each paginatedCurrencies as currency (currency.id)}
                <tr>
                    <td>
                        {currency.name}

                        {#if Number(currency.isDefault) === 1}
                            <StatusBadge tone="positive">
                                {t("Default")}
                            </StatusBadge>
                        {/if}
                    </td>

                    <td><strong>{currency.code}</strong></td>
                    <td>{currency.symbol}</td>

                    <td class="col-end rate-cell">
                        {formatExchangeRate(currency.exchangeRate)}
                    </td>

                    <td>
                        {@html showDate(currency.exchangeRateDate)}
                    </td>

                    <td class="col-end">
                        <TableActions
                            actions={[
                                {
                                    icon: 'bi-pencil',
                                    label: t('Edit'),
                                    tone: 'edit',
                                    onClick: () => editCurrency(currency),
                                },
                            ]} />
                    </td>
                </tr>
            {/each}
        </DataTable>
    {/if}

    <svelte:fragment slot="footer">
        <PaginationBar
            bind:currentPage
            {totalPages}
            {itemsPerPage}
            totalItems={filteredCurrencies.length}
            ariaLabel={t("Currencies pagination")}
            rowLabel={t("rows")}
            on:perPageChange={(event) => {
                itemsPerPage = Number(event.detail);
                currentPage = 1;
            }}
            {getPageNumbers}
        />
    </svelte:fragment>
</IndexPageLayout>

<div
    class="modal fade qa-modal"
    id="createCurrencyModal"
    dir={t("dir")}
    tabindex="-1"
    aria-hidden="true"
>
    <div class="modal-dialog modal-dialog-centered qa-modal__dialog currency-modal-dialog">
        <div class="modal-content qa-modal__panel">
            <button
                type="button"
                class="qa-modal__close"
                data-mdb-dismiss="modal"
                aria-label={t("Close")}
            >
                <i class="bi bi-x-lg"></i>
            </button>

            <div class="qa-modal__intro">
                <h2>
                    {editingId ? t("Update Currency") : t("Create Currency")}
                </h2>
                <p>
                    {editingId
                        ? t("Update currency subtitle")
                        : t("Create currency subtitle")}
                </p>
            </div>

            <form class="qa-modal__form" on:submit|preventDefault={saveCurrency}>
                <label class="qa-modal__field">
                    <span>{t("Name")}</span>
                    <input type="text" id="c-name" bind:value={name} autocomplete="off" />
                </label>

                <label class="qa-modal__field">
                    <span>{t("Code")}</span>
                    <input type="text" id="c-code" bind:value={code} autocomplete="off" />
                </label>

                <label class="qa-modal__field">
                    <span>{t("Symbol")}</span>
                    <input type="text" id="c-symbol" bind:value={symbol} autocomplete="off" />
                </label>

                <label class="qa-modal__field">
                    <span>{t("Rate")}</span>
                    <input
                        type="number"
                        id="c-rate"
                        min="0.00000001"
                        step="any"
                        bind:value={rate}
                        disabled={isDefault}
                        aria-label={t("Rate")}
                    />
                </label>

                <label class="qa-modal__switch qa-modal__field--full currency-default-switch">
                    <input
                        type="checkbox"
                        id="c-default"
                        bind:checked={isDefault}
                        on:change={handleDefaultToggle}
                    />
                    <span>{t("Set as Default")}</span>
                </label>

                {#if !isDefault}
                    <div class="qa-modal__field qa-modal__field--full currency-rate-field">
                        <div class="currency-rate-label-row">
                            <span>{t("Exchange Rate")}</span>

                            <span class="currency-rate-label-actions">
                                {#if defaultCurrency}
                                    <span class="currency-base-chip">
                                        {t("Base")}: {defaultCurrency.code}
                                    </span>
                                {/if}

                                {#if editingId}
                                    <button
                                        type="button"
                                        class="currency-add-rate-button"
                                        class:active={showExtraRateRow}
                                        title={t("Add another exchange rate")}
                                        aria-label={t("Add another exchange rate")}
                                        on:click={toggleExtraRateRow}
                                    >
                                        <i class="bi bi-plus-lg"></i>
                                    </button>
                                {/if}
                            </span>
                        </div>

                        <div class="currency-rate-line" dir="ltr">
                            <span class="currency-rate-code">
                                1 {mainRateQuote.leftCode || editedCurrencyCode || "---"}
                            </span>

                            <span class="currency-rate-equals">=</span>

                            <input
                                type="number"
                                min="0.00000001"
                                step="any"
                                class="currency-rate-input"
                                bind:value={rate}
                                aria-label={t("Exchange Rate")}
                            />

                            <span class="currency-rate-code currency-rate-target">
                                {mainRateQuote.rightCode || defaultCurrency?.code || "AFN"}
                            </span>
                        </div>
                    </div>
                {:else}
                    <div class="qa-modal__field qa-modal__field--full currency-rate-field">
                        {#if editingId}
                            <div class="currency-rate-label-row">
                                <span class="currency-rate-label-actions">
                                    <button
                                        type="button"
                                        class="currency-add-rate-button"
                                        class:active={showExtraRateRow}
                                        title={t("Add another exchange rate")}
                                        aria-label={t("Add another exchange rate")}
                                        on:click={toggleExtraRateRow}
                                    >
                                        <i class="bi bi-plus-lg"></i>
                                    </button>
                                </span>
                            </div>

                            <div class="currency-foreign-grid">
                                <label class="qa-modal__field">
                                    <span>{t("Currency")}</span>
                                    <select
                                        id="rate-currency-select"
                                        bind:value={selectedRateCurrencyId}
                                        on:change={handleRateCurrencyChange}
                                    >
                                        <option value="">
                                            {t("Select Currency")}
                                        </option>

                                        {#each otherCurrencies as currency}
                                            <option value={currency.id}>
                                                {currency.name} ({currency.code})
                                            </option>
                                        {/each}
                                    </select>
                                </label>

                                <label class="qa-modal__field">
                                    <span>{t("Exchange Rate")}</span>
                                    <div class="currency-selected-rate" dir="ltr">
                                        <span class="currency-selected-rate-code">
                                            1 {selectedRateQuote.leftCode || selectedRateCurrency?.code || "---"} =
                                        </span>

                                        <input
                                            id="selected-currency-rate"
                                            type="number"
                                            min="0.00000001"
                                            step="any"
                                            bind:value={selectedRate}
                                            disabled={!selectedRateCurrency}
                                            placeholder="64"
                                        />

                                        <span class="currency-selected-rate-code">
                                            {selectedRateQuote.rightCode || "AFN"}
                                        </span>
                                    </div>
                                </label>
                            </div>
                        {:else}
                            <div class="currency-inline-notice">
                                <i class="bi bi-info-circle"></i>
                                <span>
                                    {t("After creating the first default currency, edit it to set rates for the other currencies")}
                                </span>
                            </div>
                        {/if}
                    </div>
                {/if}

                {#if showExtraRateRow}
                    <div class="currency-extra-rate-row">
                        <label class="qa-modal__field">
                            <span>{t("Currency")}</span>
                            <select
                                id="extra-rate-currency-select"
                                bind:value={extraCurrencyId}
                                on:change={handleExtraRateCurrencyChange}
                            >
                                <option value="">
                                    {t("Select Currency")}
                                </option>

                                {#each extraCurrencies as currency}
                                    <option value={currency.id}>
                                        {currency.name} ({currency.code})
                                    </option>
                                {/each}
                            </select>
                        </label>

                        <label class="qa-modal__field">
                            <span>{t("Exchange Rate")}</span>
                            <div class="currency-selected-rate" dir="ltr">
                                <span class="currency-selected-rate-code">
                                    1 {extraRateQuote.leftCode || extraRateCurrency?.code || "---"} =
                                </span>

                                <input
                                    id="extra-currency-rate"
                                    type="number"
                                    min="0.00000001"
                                    step="any"
                                    bind:value={extraRate}
                                    disabled={!extraRateCurrency}
                                    placeholder="64"
                                    aria-label={t("Exchange Rate")}
                                />

                                <span class="currency-selected-rate-code">
                                    {extraRateQuote.rightCode || "AFN"}
                                </span>
                            </div>
                        </label>
                    </div>
                {/if}

                <button type="submit" class="qa-modal__submit" disabled={saving}>
                    {#if saving}
                        <span
                            class="spinner-border spinner-border-sm"
                            role="status"
                            aria-hidden="true"
                        ></span>
                        {t("Saving...")}
                    {:else}
                        {editingId
                            ? t("Update Currency")
                            : t("Create Currency")}
                    {/if}
                </button>
            </form>
        </div>
    </div>
</div>

<style>
    .currencies-page-actions {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin-bottom: 0.5rem;
        direction: ltr;
    }

    .rate-cell {
        direction: ltr;
        text-align: end;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }

    /* Currency modal — follows the shared qa-modal design language. */
    .qa-modal .modal-dialog.qa-modal__dialog.currency-modal-dialog {
        width: min(95vw, 34rem);
        max-width: min(95vw, 34rem);
    }

    .currency-default-switch {
        cursor: pointer;
        user-select: none;
    }

    .currency-default-switch input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        position: relative;
        width: 2.6rem;
        height: 1.4rem;
        margin: 0;
        border: 1px solid #dbe3ef;
        border-radius: 999px;
        background: #e2e8f0;
        cursor: pointer;
        transition: background 0.18s ease, border-color 0.18s ease;
        flex: 0 0 auto;
    }

    .currency-default-switch input[type="checkbox"]::after {
        content: "";
        position: absolute;
        top: 50%;
        inset-inline-start: 3px;
        width: 1.05rem;
        height: 1.05rem;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
        transform: translateY(-50%);
        transition: inset-inline-start 0.18s ease;
    }

    .currency-default-switch input[type="checkbox"]:checked {
        background: #0f6efd;
        border-color: #0f6efd;
    }

    .currency-default-switch input[type="checkbox"]:checked::after {
        inset-inline-start: calc(100% - 1.08rem - 3px);
    }

    .currency-default-switch input[type="checkbox"]:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(15, 110, 253, 0.2);
    }

    .currency-rate-field {
        grid-column: 1 / -1;
        display: grid;
        gap: 0.45rem;
    }

    .currency-rate-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        min-width: 0;
    }

    .currency-rate-label-row > span:first-child {
        color: #334155;
        font-size: var(--control-font, 0.84rem);
        font-weight: 700;
    }

    .currency-base-chip {
        flex: 0 0 auto;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        background: #f1f5f9;
        color: #64748b;
        font-size: 0.72rem;
        font-weight: 700;
    }

    .currency-rate-line {
        display: grid;
        grid-template-columns: auto auto minmax(6rem, 1fr) auto;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }

    .currency-rate-code,
    .currency-rate-equals,
    .currency-selected-rate-code {
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        color: #334155;
    }

    .currency-rate-equals {
        color: #64748b;
        font-weight: 700;
    }

    .currency-rate-input {
        min-width: 0;
        width: 100%;
        text-align: left;
    }

    .currency-rate-label-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-inline-start: auto;
        flex: 0 0 auto;
        min-width: 0;
    }

    .currency-add-rate-button {
        display: inline-grid;
        width: 1.75rem;
        height: 1.75rem;
        place-items: center;
        padding: 0;
        border: 1px solid #dbe3ef;
        border-radius: var(--control-radius, 0.625rem);
        background: #ffffff;
        color: #64748b;
        cursor: pointer;
        transition: border-color 0.15s ease, color 0.15s ease,
            background 0.15s ease, transform 0.18s ease;
    }

    .currency-add-rate-button:hover {
        border-color: #0f6efd;
        background: rgba(15, 110, 253, 0.06);
        color: #0f6efd;
    }

    .currency-add-rate-button.active {
        border-color: #0f6efd;
        background: rgba(15, 110, 253, 0.08);
        color: #0f6efd;
        transform: rotate(45deg);
    }

    .currency-extra-rate-row {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        align-items: end;
        gap: 0.85rem;
        min-width: 0;
    }

    .currency-foreign-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        gap: 0.85rem;
        margin-top: 0.35rem;
    }

    .currency-selected-rate {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
    }

    .currency-selected-rate input {
        flex: 1;
        min-width: 0;
    }

    .currency-selected-rate-code {
        font-size: 0.8rem;
        color: #64748b;
    }

    .currency-inline-notice {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        margin-top: 0.35rem;
        padding: 0.65rem 0.8rem;
        border-radius: 0.625rem;
        background: #f1f5f9;
        color: #64748b;
        font-size: 0.78rem;
        line-height: 1.5;
    }

    .currency-rate-line,
    .currency-selected-rate {
        direction: ltr !important;
        unicode-bidi: isolate;
        text-align: left;
    }

    :global(html.dark) .qa-modal__panel {
        border-color: rgba(148, 163, 184, 0.34);
        background: #0b1426;
        color: #e5edf9;
    }

    :global(html.dark) .qa-modal__field span {
        color: #8fa0ba;
    }

    :global(html.dark) .qa-modal__intro h2 {
        color: #e5edf9;
    }

    :global(html.dark) .qa-modal__intro p {
        color: #8fa0ba;
    }

    :global(html.dark) .qa-modal__switch {
        color: #e5edf9;
    }

    :global(html.dark) .qa-modal__close {
        border-color: rgba(148, 163, 184, 0.34);
        background: #111c31;
        color: #dbe7ff;
    }

    :global(html.dark) .qa-modal__field input,
    :global(html.dark) .qa-modal__field select {
        border-color: rgba(148, 163, 184, 0.38);
        background: #111c31;
        color: #e5edf9;
    }

    :global(html.dark) .qa-modal__field input:focus,
    :global(html.dark) .qa-modal__field select:focus {
        border-color: #6f9cff;
        box-shadow: 0 0 0 3px rgba(111, 156, 255, 0.18);
    }

    :global(html.dark) .currency-default-switch input[type="checkbox"] {
        border-color: rgba(148, 163, 184, 0.38);
        background: #1e293b;
    }

    :global(html.dark) .currency-default-switch input[type="checkbox"]::after {
        background: #e2e8f0;
    }

    :global(html.dark) .currency-rate-code,
    :global(html.dark) .currency-selected-rate-code {
        color: #cbd5e1;
    }

    :global(html.dark) .currency-rate-equals {
        color: #8fa0ba;
    }

    :global(html.dark) .currency-add-rate-button {
        border-color: rgba(148, 163, 184, 0.34);
        background: #111c31;
        color: #8fa0ba;
    }

    :global(html.dark) .currency-add-rate-button:hover,
    :global(html.dark) .currency-add-rate-button.active {
        border-color: #6f9cff;
        background: rgba(111, 156, 255, 0.14);
        color: #9db8ff;
    }

    :global(html.dark) .currency-base-chip {
        background: #111c31;
        color: #8fa0ba;
    }

    :global(html.dark) .currency-inline-notice {
        background: #111c31;
        color: #8fa0ba;
    }

    @media (max-width: 640px) {
        .currency-foreign-grid {
            grid-template-columns: 1fr;
        }

        .currency-rate-line {
            grid-template-columns: auto auto minmax(0, 1fr) auto;
        }

        .currency-extra-rate-row {
            grid-template-columns: 1fr;
        }
    }
</style>
