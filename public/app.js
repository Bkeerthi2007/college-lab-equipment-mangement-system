
const API = "";

// Common API request
async function api(url, options = {}) {
    const response = await fetch(API + url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

// Safe display
function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    }[c]));
}

// Messages
function message(id, text, error = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = error ? "error" : "success";
}

// Load equipment dropdown
async function loadEquipment(select) {
    const rows = await api("/equipment");

    if (select) {
        select.innerHTML =
            '<option value="">Select Equipment</option>' +
            rows.map(x => `
                <option value="${x.equipment_id}">
                    #${x.equipment_id} - ${safe(x.name)}
                </option>
            `).join("");
    }

    return rows;
}

// DASHBOARD
if (document.getElementById("equipmentCount")) {
    api("/api/dashboard").then(data => {
        document.getElementById("equipmentCount").textContent =
            data.equipment;
        document.getElementById("userCount").textContent =
            data.users;
        document.getElementById("issuedCount").textContent =
            data.issued;
    }).catch(console.error);
}

// INSERT EQUIPMENT
const equipmentForm = document.getElementById("equipmentForm");

if (equipmentForm) {
    equipmentForm.addEventListener("submit", async e => {
        e.preventDefault();

        try {
            const data = Object.fromEntries(
                new FormData(equipmentForm)
            );

            const result = await api("/equipment", {
                method: "POST",
                body: JSON.stringify(data)
            });

            equipmentForm.reset();

            message("message",
                result.message + " | ID: " + result.equipment_id);

        } catch (err) {
            message("message", err.message, true);
        }
    });
}

// LIST ALL EQUIPMENT
const equipmentRows = document.getElementById("equipmentRows");

async function showEquipment() {
    if (!equipmentRows) return;

    try {
        const rows = await api("/equipment");

        equipmentRows.innerHTML = rows.length
            ? rows.map(x => `
                <tr>
                    <td>#${x.equipment_id}</td>
                    <td>${safe(x.name)}</td>
                    <td>${safe(x.category || "-")}</td>
                    <td>${x.quantity}</td>
                    <td>${x.available_quantity}</td>
                    <td>
                        <span class="status">
                            ${safe(x.status)}
                        </span>
                    </td>
                </tr>
            `).join("")
            : '<tr><td colspan="6">No equipment found</td></tr>';

    } catch (err) {
        equipmentRows.innerHTML =
            `<tr><td colspan="6">${safe(err.message)}</td></tr>`;
    }
}

showEquipment();

// LIST ONE EQUIPMENT
const findButton = document.getElementById("findButton");

if (findButton) {
    const select = document.getElementById("equipmentSelect");
    const output = document.getElementById("result");

    loadEquipment(select).catch(err => {
        output.textContent = err.message;
    });

    findButton.addEventListener("click", async () => {
        if (!select.value) {
            output.textContent = "Select equipment ID first.";
            return;
        }

        try {
            const x = await api("/equipment/" + select.value);

            output.innerHTML = `
                <h2>${safe(x.name)}</h2>
                <p><b>ID:</b> ${x.equipment_id}</p>
                <p><b>Category:</b> ${safe(x.category)}</p>
                <p><b>Total:</b> ${x.quantity}</p>
                <p><b>Available:</b> ${x.available_quantity}</p>
                <p><b>Status:</b> ${safe(x.status)}</p>
            `;
        } catch (err) {
            output.textContent = err.message;
        }
    });
}

// UPDATE EQUIPMENT
const updateForm = document.getElementById("updateForm");

if (updateForm) {
    const select = document.getElementById("equipmentSelect");

    loadEquipment(select).catch(err =>
        message("message", err.message, true)
    );

    document.getElementById("loadButton")
        .addEventListener("click", async () => {

            if (!select.value) {
                message("message", "Select equipment ID", true);
                return;
            }

            try {
                const x = await api("/equipment/" + select.value);

                ["name", "category", "quantity",
                 "available_quantity", "status"].forEach(key => {
                    updateForm.elements[key].value = x[key] ?? "";
                });

                updateForm.classList.remove("hidden");
                message("message", "Details loaded successfully");

            } catch (err) {
                message("message", err.message, true);
            }
        });

    updateForm.addEventListener("submit", async e => {
        e.preventDefault();

        try {
            const data = Object.fromEntries(
                new FormData(updateForm)
            );

            const result = await api("/equipment/" + select.value, {
                method: "PUT",
                body: JSON.stringify(data)
            });

            message("message", result.message);

        } catch (err) {
            message("message", err.message, true);
        }
    });
}

// DELETE EQUIPMENT
const deleteButton = document.getElementById("deleteButton");

if (deleteButton) {
    const select = document.getElementById("equipmentSelect");

    loadEquipment(select).catch(err =>
        message("message", err.message, true)
    );

    select.addEventListener("change", async () => {
        const preview = document.getElementById("preview");

        if (!select.value) {
            preview.textContent = "Select equipment to preview.";
            return;
        }

        try {
            const x = await api("/equipment/" + select.value);

            preview.innerHTML = `
                <h3>${safe(x.name)}</h3>
                <p>Category: ${safe(x.category)}</p>
                <p>Quantity: ${x.quantity}</p>
                <p>Available: ${x.available_quantity}</p>
            `;
        } catch (err) {
            preview.textContent = err.message;
        }
    });

    deleteButton.addEventListener("click", async () => {
        if (!select.value) {
            message("message", "Select equipment first", true);
            return;
        }

        if (!confirm("Do you want to delete this equipment?")) return;

        try {
            const result = await api("/equipment/" + select.value, {
                method: "DELETE"
            });

            message("message", result.message);
            await loadEquipment(select);
            document.getElementById("preview").textContent =
                "Equipment deleted.";

        } catch (err) {
            message("message", err.message, true);
        }
    });
}

// LOAD USERS
async function loadUsers() {
    const select = document.getElementById("issueUser");
    if (!select) return;

    const users = await api("/users");

    select.innerHTML =
        '<option value="">Select User</option>' +
        users.map(u => `
            <option value="${u.user_id}">
                ${safe(u.name)} (${safe(u.role)})
            </option>
        `).join("");
}

// ISSUE FORM
const issueForm = document.getElementById("issueForm");

if (issueForm) {
    Promise.all([
        loadEquipment(document.getElementById("issueEquipment")),
        loadUsers()
    ]).catch(err =>
        message("issueMessage", err.message, true)
    );

    issueForm.addEventListener("submit", async e => {
        e.preventDefault();

        try {
            const data = Object.fromEntries(
                new FormData(issueForm)
            );

            const result = await api("/issues", {
                method: "POST",
                body: JSON.stringify(data)
            });

            issueForm.reset();
            message("issueMessage",
                result.message + " | ID: " + result.issue_id);

            await loadIssueRecords();

        } catch (err) {
            message("issueMessage", err.message, true);
        }
    });

    loadIssueRecords();
}

// LIST ISSUE RECORDS
async function loadIssueRecords() {
    const tbody = document.getElementById("issueRows");
    if (!tbody) return;

    try {
        const rows = await api("/issues");

        tbody.innerHTML = rows.length
            ? rows.map(x => `
                <tr>
                    <td>#${x.issue_id}</td>
                    <td>${safe(x.equipment_name)}</td>
                    <td>${safe(x.user_name)}</td>
                    <td>${safe(x.issue_date)}</td>
                    <td>${safe(x.return_date || "-")}</td>
                    <td>${x.quantity}</td>
                    <td>${safe(x.status)}</td>
                    <td>
                        ${x.status === "Issued"
                            ? `<button class="table-btn"
                                onclick="returnEquipment(${x.issue_id})">
                                Return
                               </button>`
                            : "Completed"}
                    </td>
                </tr>
            `).join("")
            : '<tr><td colspan="8">No issue records found</td></tr>';

    } catch (err) {
        tbody.innerHTML =
            `<tr><td colspan="8">${safe(err.message)}</td></tr>`;
    }
}

// RETURN EQUIPMENT
async function returnEquipment(id) {
    if (!confirm("Confirm equipment return?")) return;

    try {
        const result = await api("/issues/" + id + "/return", {
            method: "PUT"
        });

        alert(result.message);
        await loadIssueRecords();
    } catch (err) {
        alert(err.message);
    }
}
