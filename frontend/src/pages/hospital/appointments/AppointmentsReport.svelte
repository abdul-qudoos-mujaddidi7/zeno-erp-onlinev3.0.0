<script>
    import { onMount, tick } from "svelte";
    import { t, lang, translate_org_type } from "../../../i18n/i18n";
    import { push } from "svelte-spa-router";

    import { showDate, setDatePickers } from "../../../calendar.js";
import { accountApi } from '../../../api/accountApi.js';
import { appointmentApi } from '../../../api/appointmentApi.js';

    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    let componentRoot = null;
    let patients = [];
    let patient = null;
    let patientType = null;
    let imageUrl = null;
    let appointments = [];
    let computedBalance = {}; // per-currency computed balances

    function handleDateChange(inputName, value) {
        if (inputName === "startDate") startDate = value;
        else if (inputName === "endDate") endDate = value;
    }

    let TREASURY_ID = null;
    let NOTRACK_ID = null;

    onMount(async () => {
        await loadPatients();
        tick().then(() => setDatePickers(handleDateChange, componentRoot));
    });
    function getPatientName(id) {
        const acc = patients.find((a) => a.id === id) || {};
        if (t("Lang") === "en") return acc.name || "";
        if (t("Lang") === "fa") return acc.name_fa || acc.name || "";
        if (t("Lang") === "ps") return acc.name_ps || acc.name || "";
        return acc.name || "";
    }

    // Filters & pagination
    let q = "";
    let page = 1;
    let pageSize = 10;
    const pageSizes = [10, 25, 50, 100];

    async function loadPatients(id) {
        patients = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];
        if (!patients) return;

        TREASURY_ID =
            (
                await (await accountApi.getAll({ status: 1, code: 'TREASURY' }))?.data?.[0]
            )?.id || null;

        NOTRACK_ID = 
            (
                await (await accountApi.getAll({ status: 1, code: 'NOTRACK' }))?.data?.[0]
            )?.id || null;

        startDate = '';
        endDate = '';
        q = "";
        page = 1;

        await loadAppointments();
        // reset filters when loading a new patient
    }

    // derived lists
    let filtered = [];
    let processed = [];
    let paginated = [];
    let totalPages = 1;

    function getLocalDate() {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split("T")[0];
    }

    let startDate = '';
    let endDate = '';

    $: filtered = appointments.filter((j) => {
        const jd = j.date ? new Date(j.date) : null;
        if (startDate && jd && jd < new Date(startDate)) return false;
        if (endDate && jd && jd > new Date(endDate + "T23:59:59")) return false;
        if (q) {
            const s = q.toLowerCase();
            const hay =
                (j.description || "") +
                " " +
                (j.reference_type || "") +
                " " +
                (j.reference_id || "");
            if (!hay.toLowerCase().includes(s)) return false;
        }
        return true;
    });

    // compute running balances per currency
    $: {
        // starting balances per currency (use patient.balance only for patient.currency)
        const starting = {};
        if (patient?.currency && patient?.balance != null) {
            starting[patient.currency] = 0;
        }

        const asc = [...filtered].slice(); // oldest -> newest
        let lastBal = { ...starting };
        const processedAsc = asc.map((j) => {
            const debit = Number(j.debit || 0);
            const credit = Number(j.credit || 0);
            const cur = j.currency || patient?.currency || "DEFAULT";
            // copy previous
            const balObj = { ...lastBal };
            balObj[cur] = (balObj[cur] || 0) + (credit - debit);
            lastBal = balObj;
            return { ...j, debit, credit, running: balObj };
        });

        processedAsc.reverse(); // newest -> oldest for display
        // chronological (oldest -> newest) for display
        processed = processedAsc.slice();
        const totals = {};

        for (const j of filtered) {
            const cur = j.currency || patient?.currency || "DEFAULT";
            const debit = Number(j.debit || 0);
            const credit = Number(j.credit || 0);

            if (!totals[cur]) {
                totals[cur] = { debit: 0, credit: 0, balance: 0 };
            }

            totals[cur].debit += debit;
            totals[cur].credit += credit;
            totals[cur].balance += credit - debit;
        }

        computedBalance = totals;

        totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
        if (page > totalPages) page = totalPages;
        paginated = processed.slice((page - 1) * pageSize, page * pageSize);
    }

    async function loadAppointments() {
        let journs = (await appointmentApi.getAll({ status: 1 }))?.data || [];

        //NOTRACK, RECEIVABLE, PAYABLE, SALES, PURCHASE are special patients that we don't want to show in the report as they are just used for tracking purposes and can be confusing for users. So we filter out any appointments that have these patients as either first or second entry.

        let patientsToExclude = [];
        const specialCodes = ["RECEIVABLE", "PAYABLE", "SALES", "PURCHASE"];
        for (const code of specialCodes) {
            const acc = await accountApi.getAll({ status: 1, code }).then((r) => r?.data?.[0]);
            if (acc) patientsToExclude.push(acc.id);
        }

        console.log("Excluding patients with IDs", patientsToExclude);
        journs = journs.filter(
            (j) =>
                j.status === 1 &&
                !patientsToExclude.includes(j.first_entry_patient) &&
                !patientsToExclude.includes(j.second_entry_patient),
        );

        let bal = 0;
        const processedLocal = journs.map((j) => {
            let debit =
                    Number(j.first_entry_debit) +
                        Number(j.second_entry_debit) || 0,
                credit =
                    Number(j.first_entry_credit) +
                        Number(j.second_entry_credit) || 0,
                currency = j.currency;

            if (j.first_entry_patient == TREASURY_ID) {
                debit = Number(j.second_entry_debit) || 0;
                credit = Number(j.second_entry_credit) || 0;
            }


            if (j.second_entry_patient == TREASURY_ID) {
                debit = Number(j.first_entry_debit) || 0;
                credit = Number(j.first_entry_credit) || 0;
            }


            // if (j.first_entry_patient == NOTRACK_ID) {
            //     debit = Number(j.second_entry_debit) || 0;
            //     credit = Number(j.second_entry_credit) || 0;
            // }


            // if (j.second_entry_patient == NOTRACK_ID) {
            //     debit = Number(j.first_entry_debit) || 0;
            //     credit = Number(j.first_entry_credit) || 0;
            // }


            // store raw debit/credit so filters can use them
            return { ...j, debit, credit, currency };
        });

        // newest first
        appointments = processedLocal.reverse();
        computedBalance = appointments.reduce(
            (s, j) => s + (Number(j.credit || 0) - Number(j.debit || 0)),
            0,
        );

        appointments = appointments.reverse();
    }

    function fmtDate(d) {
        if (!d) return "-";
        try {
            return new Date(d).toLocaleString();
        } catch (e) {
            return d;
        }
    }

    function formatRunningObj(obj) {
        console.log(obj);
        if (!obj) return "-";
        return Object.keys(obj)
            .map((k) => `${obj[k].toLocaleString()} ${t(k)}`)
            .join("<br />");
    }

    function goBack() {
        push("/dashboard/patients");
    }

    function exportCsv() {
        const rows = [];
        rows.push([
            "Date",
            "Reference",
            "Description",
            "Debit",
            "Credit",
            "Balance",
        ]);
        for (const j of processed) {
            rows.push([
                fmtDate(j.date),
                `${j.reference_type || ""}#${j.reference_id || ""}`,
                j.description || "",
                j.debit || 0,
                j.credit || 0,
                j.running || 0,
            ]);
        }
        const csv = rows
            .map((r) =>
                r
                    .map((c) => '"' + String(c).replace(/"/g, '""') + '"')
                    .join(","),
            )
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${patient ? patient.code : "patient"}-transactions.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function getCurrencyInfoArray(obj) {
        let arr = [];
        for (const k in obj) {
            arr.push({
                code: k,
                debit: obj[k].debit,
                credit: obj[k].credit,
                balance: obj[k].balance,
                color: k === patient?.currency ? "primary" : "success",
            });
        }
        return arr;
    }
</script>

<!-- Transactions section (full width) -->

<div bind:this={componentRoot}>
    <div class="mb-3 row">
        <div class="col-md-2">
            <input
                class="form-control form-control-sm"
                placeholder={t("Search transactions")}
                bind:value={q}
                on:input={() => (page = 1)}
                style="max-width:320px;"
            />
        </div>
        <div class="col-md-2">
            <div class="input-group input-group-sm persianDatePicker">
                <input
                    type="date"
                    class="form-control"
                    data-bind="startDate"
                    bind:value={startDate}
                />

                <span class="input-group-text persian-date-text"></span>
            </div>
        </div>

        <div class="col-md-2">
            <div class="input-group input-group-sm persianDatePicker">
                <input
                    type="date"
                    class="form-control"
                    data-bind="endDate"
                    bind:value={endDate}
                />

                <span class="input-group-text persian-date-text"></span>
            </div>
        </div>
    </div>
    <div class="my-3 d-flex justify-content-start align-items-center">
        {#each getCurrencyInfoArray(computedBalance) as cur}
            <div
                class="card me-4 shadow border-start border-{cur.color} border-5"
            >
                <div class="card-body p-4">
                    <div class="d-flex align-items-center">
                        <div class="flex-grow-1">
                            <p class="text-{cur.color} mb-1 fw-bold">
                                {t(cur.code)}
                            </p>
                            <table>
                                <tbody>
                                    <tr>
                                        <td>{t("Credit")}</td>
                                        <td
                                            ><small class="ms-2" dir="ltr"
                                                >{cur.credit.toLocaleString()}</small
                                            > <small> {t(cur.code)}</small></td
                                        >
                                    </tr>
                                    <tr>
                                        <td>{t("Debit")}</td>
                                        <td
                                            ><small class="ms-2" dir="ltr"
                                                >{cur.debit.toLocaleString()}</small
                                            > <small> {t(cur.code)}</small></td
                                        >
                                    </tr>
                                    <tr class="fw-bold">
                                        <td>{t("Balance")}</td>
                                        <td
                                            ><small
                                                dir="ltr"
                                                class="ms-2 {cur.balance > 0
                                                    ? ''
                                                    : 'text-danger'}"
                                                >{cur.balance.toLocaleString()}</small
                                            >
                                            <small
                                                class={cur.balance > 0
                                                    ? ""
                                                    : "text-danger"}
                                            >
                                                {t(cur.code)}
                                            </small></td
                                        >
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        {/each}
    </div>

    <div class="table-responsive">
        <table class="table table-sm table-hover">
            <thead class="table-light" style="top:0;z-index:1;">
                <tr>
                    <th style="width:160px">{t("Date")}</th>
                    <th>{t("Patient")}</th>
                    <th>{t("Description")}</th>
                    <th class="text-end">{t("Debit")}</th>
                    <th class="text-end">{t("Credit")}</th>
                    <th class="text-end">{t("Balance")}</th>
                </tr>
            </thead>
            <tbody>
                {#if processed.length === 0}
                    <tr
                        ><td colspan="6" class="text-center text-muted p-4"
                            >{t("No transactions found.")}</td
                        ></tr
                    >
                {:else}
                    {#each paginated as j}
                        <tr>
                            <td style="min-width:140px">
                                {@html showDate(j.date) || "-"}
                            </td>
                            <td>
                                <span
                                    class="badge badge-{j.first_entry_credit > 0
                                        ? 'success'
                                        : 'danger'}"
                                >
                                    {getPatientName(j.first_entry_patient)}
                                </span>
                                <span
                                    class="badge badge-{j.second_entry_credit >
                                    0
                                        ? 'success'
                                        : 'danger'}"
                                >
                                    {getPatientName(j.second_entry_patient)}
                                </span>
                            </td>
                            <td>{j.description || "-"}</td>
                            <td class="text-end"
                                ><span class="badge badge-danger"
                                    >{#if j.debit || 0}{Number(j.debit).toLocaleString(undefined,{
                                                        maximumFractionDigits: 3,
                                                    }) ||
                                            0}
                                        {t(j.currency || "")}{/if}</span
                                ></td
                            >
                            <td class="text-end"
                                ><span class="badge badge-success"
                                    >{#if j.credit || 0}{Number(j.credit).toLocaleString(undefined,{
                                                        maximumFractionDigits: 3,
                                                    }) ||
                                            0}
                                        {t(j.currency || "")}{/if}</span
                                ></td
                            >
                            <td class="text-end"
                                >{@html formatRunningObj(j.running) || 0}</td
                            >
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>
    </div>

    <div class="d-flex justify-content-between align-items-center mt-2">
        <div class="small text-muted">
            {t("Showing")}
            {processed.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(
                page * pageSize,
                processed.length,
            )}
            {t("of")}
            {processed.length}
        </div>
        <div class="d-flex align-items-center gap-2">
            <button
                class="btn btn-sm btn-outline-secondary me-1"
                on:click={() => (page = Math.max(1, page - 1))}
                disabled={page <= 1}>{t("Prev")}</button
            >
            <span class="mx-1 small">{page}&nbsp;/&nbsp;{totalPages}</span>
            <button
                class="btn btn-sm btn-outline-secondary ms-1"
                on:click={() => (page = Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}>{t("Next")}</button
            >

            <select
                class="form-select form-select-sm"
                bind:value={pageSize}
                on:change={() => (page = 1)}
            >
                {#each pageSizes as s}
                    <option value={s}>{s}</option>
                {/each}
            </select>
        </div>
    </div>
</div>
