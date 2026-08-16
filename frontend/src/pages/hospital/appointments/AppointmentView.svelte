<script>
    import { onMount } from "svelte";
import { departmentApi } from '../../../api/departmentApi.js';
    import { push } from "svelte-spa-router";

    import { t, lang, translate_org_type,shortID } from "../../../i18n/i18n";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { showDate } from "../../../calendar.js";

    import AddAppointment from "./AddAppointment.svelte";
    import Prescriptions from "../Prescriptions.svelte";
    export let id;

    import AppointmentDocuments from "./AppointmentDocuments.svelte";
    import LabTestsIndex from "../labtests/LabTestsIndex.svelte";
    import { appointmentApi } from '../../../api/appointmentApi.js';
    let modalRef2;
    let modalRef3;
    let appointment = null;
    let followups = [];

  let visit_types = ['outpatient', 'emergency', 'followup', 'inpatient', 'consulting'];
  let visit_type_colors = ['primary', 'danger', 'warning', 'secondary', 'success'];
  let visit_statuses = ['pending', 'waiting', 'in_progress', 'in_examination','in_operation','in_bed','following_up', 'completed','cancelled'];
  let visit_status_colors = ['secondary', 'info', 'warning', 'primary','danger','dark','warning', 'success','dark'];

    export let page = 'info';

    import { toast } from "../../../ToastUI/toast.js";
import { userApi } from '../../../api/userApi.js';

    let departments = [];
    let doctors = [];


  function getDoctorName(id) {
    const doc = doctors.find((d) => d.id === id) || {};
    return doc.first_name+" "+doc.last_name || '';
  }


    let diagnosis = "";
    let vitals = "";
    let prescriptions = "";
    let doctor_notes = "";

    async function loadAppointment(currentId) {
        if (!currentId) return;
        appointment = (await appointmentApi.getById(parseInt(currentId)))?.data || null;
        diagnosis = appointment?.diagnosis || "";
        vitals = appointment?.vitals || "";
        prescriptions = appointment?.prescriptions || "";
        doctor_notes = appointment?.doctor_notes || "";

        const allAppts = (await appointmentApi.getAll({ status: 1 }))?.data || [];
        followups = allAppts.filter((a) => Number(a.parent_visit_id) === Number(appointment?.id));
    }

    function getPatientTypeColor(type) {
        const colors = ['dark', 'primary','secondary','danger','success', 'info', 'warning', 'dark','secondary'];
        return colors[type];
    }
    // 👇 THIS is what makes it rerun when id changes
    $: if (id) {
        loadAppointment(id);
    }

    $: appointmentColor = appointment?.patient_type_id? getPatientTypeColor(appointment?.patient_type_id || 0) || 0 : 'primary';

    onMount(async () => {

        departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
        doctors = await (await userApi.getAll({ status: 1 }))?.data || [];

        loadAppointment(id);

        modalRef2.modalOpened(Number(id));

        document
            .querySelectorAll("[data-mdb-tab-init]")
            .forEach((el) => new window.mdb.Tab(el));

        setTimeout(() => {
            document
                .querySelectorAll("[data-mdb-tab-init]")
                .forEach((el) => new window.mdb.Tab(el));
        }, 1000);


    });


    function saved() {
        loadAppointment(id);
    }

    async function saveReport() {
        if (!appointment) return;
        await appointmentApi.update(appointment.id, {
            diagnosis,
            vitals,
            prescriptions,
            doctor_notes
        });
        loadAppointment(id);
        toast.success(t("Success"), t("Report saved successfully"));
    }




</script>

<ul class="nav nav-tabs mb-3 bg-body-tertiary border shadow-sm rounded" role="tablist" style="--tab-bg-color: var(--mdb-{appointmentColor}-bg-subtle);--tab-text-color: var(--mdb-{appointmentColor}-text-emphasis)">
    
    {#if appointment?.parent_visit_id}
        <li class="nav-item rounded-start" role="presentation">
            <button
                class="nav-link {page=='info'?"active":""} py-2 rounded-start bg-info text-white fw-bold px-3"
                type="button"
                on:click={() => {
                    push(`/dashboard/appointment/${appointment.parent_visit_id}`);
                }}
            >
                {t("Parent Appointment")}: {shortID(appointment?.parent_visit_id)}
            </button>
        </li>
    {/if}
    
    <li class="nav-item rounded-start" role="presentation">
        <button
            class="nav-link {page=='info'?"active":""} py-2 rounded-start bg-{appointmentColor} text-white fw-bold px-3"
            type="button"
            on:click={() => {
                page = 'info';
            }}
        >
            {t("Appointment")}: {shortID(appointment?.id)}
        </button>
    </li>
    
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='report'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'report';
            }}
        >
            {t("Doctor Report")}
        </button>
    </li>
    {#if localStorage.getItem('org_type')&&localStorage.getItem('org_type') != 'barbershop'}
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='prescriptions'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'prescriptions';
            }}
        >
            {t("Prescriptions")}
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='labtests'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'labtests';
            }}
        >
            {t("Lab Tests")}
        </button>
    </li>
    {/if}
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='documents'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'documents';
            }}
        >
            {t("Documents")}
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='followups'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'followups';
            }}
        >
            {t("Follow-ups")}
        </button>
    </li>
</ul>

{#if page === 'info'}

         <AddAppointment bind:this={modalRef2} appointmentId={Number(appointment?.id)} on:saved={saved} />
         {:else if page === 'report'}
        <h4>{t("Doctor Report")}</h4>
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">{t("Diagnosis")}</h5>
                        <textarea bind:value={diagnosis} class="form-control" rows="5">{appointment?.diagnosis}</textarea>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">{t("Vitals")}</h5>
                        <textarea bind:value={vitals} class="form-control" rows="5">{appointment?.vitals}</textarea>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">{t("Prescriptions")}</h5>
                        <textarea bind:value={prescriptions} class="form-control" rows="5">{appointment?.prescriptions}</textarea>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">{t("Doctor Notes")}</h5>
                        <textarea bind:value={doctor_notes} class="form-control" rows="5">{appointment?.doctor_notes}</textarea>
                    </div>
                </div>
            </div>


            <div class="col-md-6">
                <div class="card mb-3">
                    <div class="card-body">
                        <button class="btn btn-primary" on:click={saveReport}><i class="bi bi-save me-2"></i> {t("Save")}</button>
                    </div>
                </div>
            </div>
        </div>

    {:else if page === 'prescriptions'}
        <Prescriptions appointment_id={Number(appointment?.id)} />
    {:else if page === 'labtests'}
        <LabTestsIndex appointment_id={Number(appointment?.id)} />
    {:else if page === 'documents'}
        <AppointmentDocuments id={Number(appointment?.id)} />
    {:else if page === 'followups'}

         <AddAppointment parent_visit_id={Number(appointment?.id)} bind:this={modalRef3} on:saved={saved} />






<div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer">
                {t('ID')}
              </th>
              <th class="text-center cursor-pointer"
                >{t('Date')}
              </th>
              <th class="text-center cursor-pointer"
                >{t('Department')}
              </th>
              <th class="text-center cursor-pointer"
                >{t('Doctor')}
              </th>

              <th class="text-center cursor-pointer"
                >{t('Appointment')}
               
              </th>
              <th class="text-center cursor-pointer">{t('Fee')} </th>
              
              <th class="text-center cursor-pointer"
                >{t('Visit')}
               
              </th>
              <th class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each followups as j}
              <tr>
                <td class="ps-4 text-muted small" style="vertical-align: middle;">
                  
                
                <span class="badge badge-info d-block mb-1" on:click={() => push(`/dashboard/appointment/${j.id}`)} style="cursor:pointer"
                    >{shortID(j.id)}</span
                  >
                
                </td>


                <td class="text-center" style="vertical-align: middle;">{@html showDate(j.date)}</td>
               
                <td class="text-center" style="vertical-align: middle;">
                    {departments.find((d) => d.id === j.department_id)?.name || ''}
                </td>
                <td class="text-center" style="vertical-align: middle;">
                    {getDoctorName(j.doctor_id)}
                </td>
                <td class="text-center fw-bold" style="vertical-align: middle;">{j.serial_no}</td>
                <td class="text-center fw-bold" style="vertical-align: middle;">
                  <span class="badge badge-info d-block mb-1"
                    >{j.fee != 0
                      ? Number(j.fee).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        }) +
                        ' ' +
                        t(j.currency)
                      : ''}</span
                  >
                
                <span class="badge badge-success d-block mb-1"
                    >{j.paid_amount != 0
                      ? Number(j.paid_amount || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        }) +
                        ' ' +
                        t(j.currency)
                      : ''}</span
                  >
                
                </td>
              
                <td class="text-center fw-bold" style="vertical-align: middle;">
                <span class='badge badge-{visit_type_colors[visit_types.indexOf(j.visit_type)]} d-block mb-1'>{t(j.visit_type)}</span>
                <span class='badge badge-{visit_status_colors[visit_statuses.indexOf(j.visit_status)]} d-block'>{t(j.visit_status)}</span>
                  </td>
              
              
                <td class="text-center" style="vertical-align: middle;">
                    <button class="btn btn-sm btn-outline-info px-2" on:click={() => push(`/dashboard/appointment/${j.id}`)}>
                      <i class="bi bi-eye"></i>
                    </button>
                </td>
              </tr>
            {/each}
            {#if followups.length === 0}
              <tr>
                <td colspan="12" class="text-center text-muted p-4">{t('No appointment entries found.')}</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

{/if}
<style>
.nav-link.active {
  background-color:var(--tab-bg-color);
  color: var(--tab-text-color);
  border-color:var(--tab-text-color);
}
</style>


<!-- Button -->
