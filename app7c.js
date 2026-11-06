
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "root",
    database: "lab_management",
    waitForConnections: true,
    connectionLimit: 10
});

// INDEX - Dashboard
app.get("/api/dashboard", async (req, res) => {
    try {
        const [[e]] = await db.query(
            "SELECT COUNT(*) total FROM equipment"
        );

        const [[u]] = await db.query(
            "SELECT COUNT(*) total FROM users"
        );

        const [[i]] = await db.query(
            "SELECT COUNT(*) total FROM issue_records WHERE status='Issued'"
        );

        res.json({
            equipment: e.total,
            users: u.total,
            issued: i.total
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// INSERT EQUIPMENT
app.post("/equipment", async (req, res) => {
    try {
        const {
            name, category, quantity, available_quantity, status
        } = req.body;

        if (!name || quantity === undefined ||
            available_quantity === undefined) {
            return res.status(400).json({
                error: "Required fields are missing"
            });
        }

        const q = Number(quantity);
        const a = Number(available_quantity);

        if (!Number.isInteger(q) || !Number.isInteger(a) ||
            q < 0 || a < 0 || a > q) {
            return res.status(400).json({
                error: "Enter valid quantities"
            });
        }

        const [result] = await db.query(
            `INSERT INTO equipment
            (name, category, quantity, available_quantity, status)
            VALUES (?, ?, ?, ?, ?)`,
            [name, category, q, a, status || "Available"]
        );

        res.json({
            message: "Equipment added successfully",
            equipment_id: result.insertId
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LIST ALL EQUIPMENT
app.get("/equipment", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM equipment ORDER BY equipment_id DESC"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LIST ONE EQUIPMENT
app.get("/equipment/:id", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM equipment WHERE equipment_id=?",
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                error: "Equipment not found"
            });
        }

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE EQUIPMENT
app.put("/equipment/:id", async (req, res) => {
    try {
        const {
            name, category, quantity, available_quantity, status
        } = req.body;

        const q = Number(quantity);
        const a = Number(available_quantity);

        if (!name || !Number.isInteger(q) ||
            !Number.isInteger(a) || q < 0 || a < 0 || a > q) {
            return res.status(400).json({
                error: "Enter valid equipment details"
            });
        }

        const [result] = await db.query(
            `UPDATE equipment SET
            name=?, category=?, quantity=?,
            available_quantity=?, status=?
            WHERE equipment_id=?`,
            [name, category, q, a, status, req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                error: "Equipment not found"
            });
        }

        res.json({ message: "Equipment updated successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE EQUIPMENT
app.delete("/equipment/:id", async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM equipment WHERE equipment_id=?",
            [req.params.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                error: "Equipment not found"
            });
        }

        res.json({ message: "Equipment deleted successfully" });

    } catch (err) {
        if (err.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                error: "Equipment has issue history and cannot be deleted"
            });
        }
        res.status(500).json({ error: err.message });
    }
});

// ADD USER
app.post("/users", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({
                error: "All user fields are required"
            });
        }

        const [result] = await db.query(
            `INSERT INTO users (name, email, password, role)
             VALUES (?, ?, ?, ?)`,
            [name, email, password, role]
        );

        res.json({
            message: "User added successfully",
            user_id: result.insertId
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LIST USERS
app.get("/users", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT user_id, name, email, role FROM users"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ISSUE EQUIPMENT
app.post("/issues", async (req, res) => {
    const { equipment_id, user_id, quantity } = req.body;
    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({
            error: "Enter a valid issue quantity"
        });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [items] = await conn.query(
            "SELECT * FROM equipment WHERE equipment_id=? FOR UPDATE",
            [equipment_id]
        );

        if (!items.length || items[0].available_quantity < qty) {
            throw new Error("Equipment unavailable or insufficient quantity");
        }

        const [users] = await conn.query(
            "SELECT user_id FROM users WHERE user_id=?",
            [user_id]
        );

        if (!users.length) {
            throw new Error("User not found");
        }

        await conn.query(
            `UPDATE equipment
             SET available_quantity=available_quantity-?,
                 status=CASE WHEN available_quantity-?=0
                 THEN 'Unavailable' ELSE 'Available' END
             WHERE equipment_id=?`,
            [qty, qty, equipment_id]
        );

        const [result] = await conn.query(
            `INSERT INTO issue_records
            (equipment_id, user_id, issue_date, quantity, status)
            VALUES (?, ?, CURDATE(), ?, 'Issued')`,
            [equipment_id, user_id, qty]
        );

        await conn.commit();

        res.json({
            message: "Equipment issued successfully",
            issue_id: result.insertId
        });

    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// LIST ISSUE RECORDS
app.get("/issues", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT i.issue_id, e.name AS equipment_name,
            u.name AS user_name, i.issue_date,
            i.return_date, i.quantity, i.status
            FROM issue_records i
            JOIN equipment e ON i.equipment_id=e.equipment_id
            JOIN users u ON i.user_id=u.user_id
            ORDER BY i.issue_id DESC
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RETURN EQUIPMENT
app.put("/issues/:id/return", async (req, res) => {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT * FROM issue_records
             WHERE issue_id=? FOR UPDATE`,
            [req.params.id]
        );

        if (!rows.length || rows[0].status !== "Issued") {
            throw new Error("Active issue record not found");
        }

        const issue = rows[0];

        const [equipment] = await conn.query(
            "SELECT * FROM equipment WHERE equipment_id=? FOR UPDATE",
            [issue.equipment_id]
        );

        if (!equipment.length) {
            throw new Error("Equipment not found");
        }

        await conn.query(
            `UPDATE equipment
             SET available_quantity=available_quantity+?,
                 status='Available'
             WHERE equipment_id=?`,
            [issue.quantity, issue.equipment_id]
        );

        await conn.query(
            `UPDATE issue_records
             SET return_date=CURDATE(), status='Returned'
             WHERE issue_id=?`,
            [req.params.id]
        );

        await conn.commit();

        res.json({ message: "Equipment returned successfully" });

    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// HOME PAGE
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
