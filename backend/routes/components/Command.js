const DashLayout = require("./DashLayout");
const commandColors = {
  new: "primary", // neutral
  pending: "danger", // neutral
  sent: "warning", // red
  answered: "info", // yellow
  executed: "success", // light blue
};



function showTimeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)
    return `${seconds} ${seconds == 1 ? "second" : "seconds"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes} ${minutes == 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours == 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days == 1 ? "day" : "days"} ago`;
}

module.exports = async function Command(req, res, db) {
  const command_id = req.params.command_id;
  let org_id = req.params.org_id;
  let user_id = req.params.user_id;
  let tab_ses_id = req.params.tab_ses_id;
  let selector = req.params.selector;
  let command_status = "new";



  const [commands] = await db.query(`SELECT * FROM \`commands\` ORDER BY created_at DESC LIMIT 20;`);

  let commandData = null;
  if (command_id != 0) {
    const [result] = await db.query(
      `
      SELECT * FROM commands
    WHERE id = ${db.escape(command_id)};`,
    );
    
    if (result && result.length == 0) {
      return res.send(
        DashLayout(
          "Command",
          req /*html*/,
          `
    <div class="card-body p-4">
      
      <h1>Command</h1>
      <p>Command not found.</p>
      <a href="/api/superadmin/list-commands/all/created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-sm btn-primary"><i class="bi bi-arrow-left"></i> Back to List</a>
      </div>
      </div>
      
    </div>

  `,
        ),
      );
    }
    commandData = result[0];
  }


  if (commandData) {
    org_id = commandData.org_id;
    user_id = commandData.user_id;
    tab_ses_id = commandData.tab_ses_id;
    selector = commandData.selector;
    command_status = commandData.command_status;
  }
  const pageName = commandData ? "Command Details of "+command_id : "New Command";
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `
        
<div class="">

  <!-- Header -->
  <div class="d-flex justify-content-between align-items-center mb-3 d-none">
      <h3 class="fw-bold mb-0">${pageName}</h3>

      <a href="/api/superadmin/list-commands/all/created_at/DESC/${req.session.user.org_id}/20/1" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i> Back to List
      </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm">
    <div class="card-body">
    <form id="commandForm">
    <input type="hidden" name="script" id="scriptInput">
      <div class="row d-none">
        <div class="col-md-4 mb-3">
          <small class="text-muted">Org</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${org_id}" name="org_id" id="org_id"></div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">user</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${user_id}" name="user_id" id="user_id"></div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Tab Ses ID</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${tab_ses_id}" name="tab_ses_id" id="tab_ses_id"></div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">selector</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${selector}" name="selector" id="selector"></div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Command Status</small>
          <div class="fw-bold">${command_status}</div>
        </div>
      </div>
      
      <div class="row">
        <div class="col-md-4 mb-4">
<div id="liveStatus" class="mb-2 text-muted">Idle</div>

      <style>
    #toolbar {
      display: flex;
      gap: 10px;
      padding: 10px;
      background: #1e1e1e;
      color: white;
    }

    #editor {
      height: 500px;
    }

    #output {
      height: 200px;
      border-top: 1px solid #ccc;
    }

    </style>

<div id="toolbar">
  <button type="submit" class="btn btn-success">Execute</button>
  <button type="button" class="btn btn-secondary" onclick="formatCode()">Format</button>
  <select id="language" class="form-control" onchange="changeLanguage()">
    <option value="javascript">JavaScript</option>
    <option value="html">HTML</option>
    <option value="css">CSS</option>
    <option value="json">JSON</option>
  </select>
</div>
<div id="editor"></div>
<iframe id="output"></iframe>

<script src="https://unpkg.com/monaco-editor@0.45.0/min/vs/loader.js"></script>
<script>
  let editor;

  require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.45.0/min/vs' }});

  require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor'), {
      value: ${JSON.stringify(commandData ? commandData.script : "console.log('Hello World');\nreturn 'Hello world';")},
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14
    });
  });

  

      function formatCode() {
        editor.getAction('editor.action.formatDocument').run();
      }


      function changeLanguage() {
        const lang = document.getElementById('language').value;
        monaco.editor.setModelLanguage(editor.getModel(), lang);
      }

      // 🔥 THIS IS THE IMPORTANT PART
      let currentCommandId = ${commandData ? commandData.id : "null"};
let pollingInterval = null;

document.getElementById('commandForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const btn = document.querySelector('#toolbar button[type="submit"]');
  btn.disabled = true;

  document.getElementById('liveStatus').innerText = "Sending command...";

  const payload = {
    script: editor.getValue(),
    org_id: document.getElementById('org_id').value,
    user_id: document.getElementById('user_id').value,
    tab_ses_id: document.getElementById('tab_ses_id').value,
    selector: document.getElementById('selector').value,
  };

  try {
    const res = await fetch('/execute-command/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // since your server redirects, we extract ID from response URL
    const resjson = await res.json();

    currentCommandId = resjson.id;
    console.log("Command ID:", currentCommandId);

    document.getElementById('liveStatus').innerText = "Command sent. Waiting...";
    pollCommand();

  } catch (err) {
    console.error(err);
    document.getElementById('liveStatus').innerText = "Error sending command";
  } finally {
    btn.disabled = false;
  }
});

async function pollCommand() {
  if (!currentCommandId) return;

  try {
    const res = await fetch('/api/superadmin/command-wait/' + currentCommandId);
    const data = await res.json();

    if (data.answer) {

      if (data.answer_type === "iframe") {
        const answerBox = document.getElementById('answerBox');
        const iframe = answerBox.querySelector('iframe') || document.createElement('iframe');
        iframe.style.width = "100%";
        iframe.style.height = "720px";
        iframe.srcdoc = data.answer;

        if (!answerBox.querySelector('iframe')) {
          answerBox.innerHTML = "";
          answerBox.appendChild(iframe);
        }
      } else if (data.answer_type === "html") {
        document.getElementById('answerBox').innerHTML = data.answer;
      } else if (data.answer_type === "imageURL") {
          document.querySelector('#answerBox').innerHTML = '<img src="' + data.answer + '" style="max-width:100%;height:auto;">';
      } else if (data.answer_type === "json") {
        try {
          const jsonData = JSON.parse(data.answer);
          document.querySelector('#answerBox').innerText = JSON.stringify(jsonData, null, 4);
        } catch (err) {
          document.querySelector('#answerBox').innerText = data.answer;
        }
      } else {
        document.querySelector('#answerBox').innerText = data.answer;
      }
      document.getElementById('answerIndicator').innerText = "Answer (" + data.answer_type + ")";
    }

    if (data.command_status === 'executed') {
      document.getElementById('liveStatus').innerText = "✅ Executed";
      return;
    }

  } catch (err) {
    console.error(err);
  }

  // 🔥 reconnect instantly
  pollCommand();
}

    </script>
        </div>
        <div class="col-md-8 mb-4">
          <h6 class="fw-bold" id='answerIndicator'>Answer (${commandData && commandData.answer_type ? commandData.answer_type : "text"})</h6>
          <pre id="answerBox" style='max-height:900px;overflow:auto;border:1px solid #888;padding:10px'>${commandData && commandData.answer_type === "imageURL" ? `<img src="${commandData.answer}" style="max-width:100%;height:auto;">` : commandData && commandData.answer ? (commandData.answer_type === "json" ? JSON.stringify(JSON.parse(commandData.answer), null, 4) : commandData.answer) : ""}${commandData && commandData.answer && commandData.answer_type !== "imageURL" && commandData.answer_type !== "json" ? commandData.answer : ""}</pre>
        </div>
        <div class="col-md-4 mb-4 d-none">
          <h6 class="fw-bold">List of Commands</h6>
          <div class='table-responsive' style='max-height:500px;overflow:auto'>
          <table class="table table-sm table-striped table-hover">
            <thead>
              <tr>
                <th>#</th>
                <th>ID</th>
                <th>Selector</th>
                <th>Value</th>
                <th>Created At</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${commands
                .map(
                  (cmd, i) => /*html*/ `
                    <tr class="table-${commandColors[cmd.command_status]?commandColors[cmd.command_status]:"dark"}">
                      <td>${i + 1}</td>
                      <td>${cmd.id}</td>
                      <td>${cmd.selector}</td>
                      <td>
                      ${cmd.selector=='tab_ses_id'?cmd.tab_ses_id:""}
                      ${cmd.selector=='user_id'?cmd.user_id:""}
                      ${cmd.selector=='org_id'?cmd.org_id:""}
                      ${cmd.selector=='token'?cmd.token:""}
                      
                      </td>
                      <td>${showTimeAgo(cmd.created_at)}</td>
                      <td>${cmd.command_status}</td>
                      <td><a href="/api/superadmin/command/${cmd.id}/0/0/0/0/" class="btn btn-sm px-1 btn-outline-primary"><i class="bi bi-eye"></i></a></td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
          </div>

        </div>


      </div>
      </form>

        `,
    ),
  );
};
