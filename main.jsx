import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  LayoutDashboard,
  MapPinned,
  Search,
  Car,
  AlertTriangle,
  FileDown,
  Trash2,
  Upload,
  RefreshCw,
  CheckCircle2,
  Users,
  MapPin,
  LogOut,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import logo from "./audi-hampton-logo.svg";
import "./styles.css";

const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY,
  supabase = createClient(url, key);
const norm = (s) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const csv = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function header(headers, names) {
  const lower = headers.map((x) => x.toLowerCase());
  for (const n of names) {
    const i = lower.findIndex((x) => x === n || x.includes(n));
    if (i >= 0) return headers[i];
  }
  return null;
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function AdminMap({ rows, scans, vinKey, stockKey, selected, onSelect }) {
  const el = useRef(null),
    map = useRef(null),
    markers = useRef(new Map());
  useEffect(() => {
    if (!el.current) return;
    map.current = L.map(el.current).setView([37.025, -76.38], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map.current);
    return () => map.current?.remove();
  }, []);
  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    const bounds = [];
    Object.values(scans)
      .filter(
        (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude),
      )
      .forEach((s) => {
        const r = rows.find((x) => norm(x[vinKey]) === s.vin) || {},
          stock = s.stock || r[stockKey] || s.vin,
          m = L.marker([s.latitude, s.longitude], {
            icon: L.divIcon({
              className: "vehicle-pin",
              html: "<span></span>",
              iconSize: [24, 32],
              iconAnchor: [12, 30],
            }),
          }).addTo(map.current);
        m.bindPopup(
          `<b>${esc(stock)}</b><br>${esc(r["Yr/Mk/Mdl"] || "")}<br><small>${esc(s.vin)}<br>${esc(s.employee_name)} • ${esc(new Date(s.scanned_at).toLocaleString())}</small>`,
        );
        m.on("click", () => onSelect(s.vin));
        markers.current.set(s.vin, m);
        bounds.push([s.latitude, s.longitude]);
      });
    if (bounds.length)
      map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    setTimeout(() => map.current?.invalidateSize(), 50);
  }, [rows, scans, vinKey, stockKey]);
  useEffect(() => {
    const m = markers.current.get(selected);
    if (m && map.current) {
      map.current.setView(m.getLatLng(), 19, { animate: true });
      m.openPopup();
    }
  }, [selected]);
  return <div className="admin-map" ref={el} />;
}

function AdminGate() {
  const [unlocked, setUnlocked] = useState(
      sessionStorage.getItem("ahi_admin_unlocked") === "yes",
    ),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  function login(e) {
    e.preventDefault();
    if (username.trim().toLowerCase() === "admin" && password === "Cl@ssic1!") {
      sessionStorage.setItem("ahi_admin_unlocked", "yes");
      setUnlocked(true);
      setError("");
      return;
    }
    setError("Incorrect administrator username or password.");
  }
  function lock() {
    sessionStorage.removeItem("ahi_admin_unlocked");
    setUnlocked(false);
    setPassword("");
  }
  if (unlocked) return <App onLock={lock} />;
  return (
    <div className="admin-login">
      <form onSubmit={login}>
        <img src={logo} alt="Audi Hampton" />
        <span>PHYSICAL INVENTORY</span>
        <h1>Administrator sign in</h1>
        <p>Authorised Audi Hampton personnel only</p>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button>
          <LockKeyhole /> Sign in securely
        </button>
        {error && <div className="admin-login-error">{error}</div>}
      </form>
    </div>
  );
}

function App({ onLock }) {
  const [ready, setReady] = useState(false),
    [sessions, setSessions] = useState([]),
    [session, setSession] = useState(null),
    [vehicles, setVehicles] = useState([]),
    [scans, setScans] = useState({}),
    [exceptions, setExceptions] = useState([]);
  const [tab, setTab] = useState("dashboard"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(null);
  const vinKey = "Serial",
    stockKey = "Vehicle";
  const rows = useMemo(
    () =>
      vehicles.map(
        (v) =>
          v.original_data || {
            Serial: v.vin,
            Vehicle: v.stock,
            "Yr/Mk/Mdl": v.description,
          },
      ),
    [vehicles],
  );
  const byVin = useMemo(
    () => new Map(rows.map((r) => [norm(r[vinKey] || r.VIN), r])),
    [rows],
  );
  const found = Object.keys(scans).length,
    total = rows.length,
    scannerCount = new Set(Object.values(scans).map((s) => s.employee_name))
      .size;
  useEffect(() => {
    (async () => {
      try {
        const connect = async () => {
            let {
              data: { session: s },
            } = await supabase.auth.getSession();
            if (!s) {
              const x = await supabase.auth.signInAnonymously();
              if (x.error) throw x.error;
            }
            await loadSessions();
          },
          timeout = new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Supabase did not respond within 15 seconds. Confirm that the project is active and Anonymous Sign-Ins are enabled.",
                  ),
                ),
              15000,
            ),
          );
        await Promise.race([connect(), timeout]);
        setReady(true);
      } catch (error) {
        setNotice({
          bad: true,
          text: error?.message || "Unable to connect to Supabase.",
        });
      }
    })();
  }, []);
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("admin-" + session.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_scans",
          filter: `session_id=eq.${session.id}`,
        },
        () => loadData(session.id),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_exceptions",
          filter: `session_id=eq.${session.id}`,
        },
        () => loadData(session.id),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.id]);
  async function loadSessions() {
    const { data, error } = await supabase
      .from("inventory_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) setNotice({ bad: true, text: error.message });
    setSessions(data || []);
  }
  async function openSession(s) {
    setBusy(true);
    setSession(s);
    setSelected("");
    await loadData(s.id);
    setBusy(false);
  }
  async function loadData(id) {
    const [{ data: v, error }, { data: a }, { data: e }] = await Promise.all([
      supabase
        .from("inventory_vehicles")
        .select("*")
        .eq("session_id", id)
        .order("stock"),
      supabase.from("inventory_scans").select("*").eq("session_id", id),
      supabase
        .from("inventory_exceptions")
        .select("*")
        .eq("session_id", id)
        .order("scanned_at", { ascending: false }),
    ]);
    if (error) setNotice({ bad: true, text: error.message });
    setVehicles(v || []);
    setScans(Object.fromEntries((a || []).map((x) => [x.vin, x])));
    setExceptions(e || []);
  }
  async function importAudit(file) {
    setBusy(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer()),
        ws = wb.Sheets[wb.SheetNames[0]],
        data = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!data.length) throw Error("The file contains no rows.");
      const keys = Object.keys(data[0]),
        vk = header(keys, ["serial", "vin", "vin number"]),
        sk = header(keys, ["vehicle", "stock", "stock number"]);
      if (!vk) throw Error("VIN column not found.");
      const clean = data.filter((r) => norm(r[vk]).length === 17),
        name = `Physical Inventory — ${new Date().toLocaleDateString()}`;
      const { data: s, error } = await supabase
        .from("inventory_sessions")
        .insert({ name, source_file: file.name })
        .select()
        .single();
      if (error) throw error;
      const payload = clean.map((r) => ({
        session_id: s.id,
        vin: norm(r[vk]),
        stock: sk ? String(r[sk]) : "",
        description: String(r["Yr/Mk/Mdl"] || ""),
        original_data: {
          ...r,
          Serial: norm(r[vk]),
          Vehicle: sk ? String(r[sk]) : "",
        },
      }));
      const { error: ve } = await supabase
        .from("inventory_vehicles")
        .insert(payload);
      if (ve) throw ve;
      await loadSessions();
      await openSession(s);
      setNotice({ text: `${clean.length} vehicles loaded into a new audit.` });
    } catch (e) {
      setNotice({ bad: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function removeScan(v) {
    const s = scans[v],
      r = byVin.get(v),
      stock = s?.stock || r?.[stockKey] || v;
    if (
      !s ||
      !confirm(
        `Remove the confirmed scan for ${stock}?\n\nThis reduces the tally and removes its map pin.`,
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase
      .from("inventory_scans")
      .delete()
      .eq("session_id", session.id)
      .eq("vin", v);
    if (error) setNotice({ bad: true, text: error.message });
    else {
      await loadData(session.id);
      setNotice({ text: `${stock} is now not confirmed.` });
    }
    setBusy(false);
  }
  const searched = useMemo(
    () =>
      rows.filter((r) => {
        const v = norm(r[vinKey] || r.VIN),
          s = scans[v],
          hay = Object.values(r).join(" ").toLowerCase();
        return (
          (!query || hay.includes(query.toLowerCase())) &&
          (filter === "all" ||
            (filter === "confirmed" && s) ||
            (filter === "missing" && !s))
        );
      }),
    [rows, scans, query, filter],
  );
  const located = useMemo(
    () =>
      rows.filter((r) => {
        const s = scans[norm(r[vinKey] || r.VIN)],
          hay = Object.values(r).join(" ").toLowerCase();
        return (
          s?.latitude != null && (!query || hay.includes(query.toLowerCase()))
        );
      }),
    [rows, scans, query],
  );
  function makeCSV(kind = "all") {
    const hs = rows[0]
        ? Object.keys(rows[0])
        : ["Serial", "Vehicle", "Yr/Mk/Mdl"],
      lines = [
        [
          ...hs,
          "Status",
          "Timestamp",
          "Scanned By",
          "Latitude",
          "Longitude",
          "GPS Accuracy (m)",
        ]
          .map(csv)
          .join(","),
      ];
    rows.forEach((r) => {
      const s = scans[norm(r[vinKey] || r.VIN)];
      if ((kind === "confirmed" && !s) || (kind === "missing" && s)) return;
      lines.push(
        [
          ...hs.map((h) => r[h]),
          s ? "CONFIRMED" : "NOT CONFIRMED",
          s?.scanned_at || "",
          s?.employee_name || "",
          s?.latitude ?? "",
          s?.longitude ?? "",
          s?.accuracy_m ?? "",
        ]
          .map(csv)
          .join(","),
      );
    });
    return lines.join("\r\n");
  }
  function exportCSV(kind) {
    download(`Audi-Hampton-${kind}-inventory.csv`, makeCSV(kind), "text/csv");
  }
  function exportKML() {
    const marks = Object.values(scans)
      .filter((s) => s.latitude != null)
      .map(
        (s) =>
          `<Placemark><name>${esc(s.stock || s.vin)}</name><description>${esc(s.vin + " | " + s.employee_name)}</description><Point><coordinates>${s.longitude},${s.latitude},0</coordinates></Point></Placemark>`,
      )
      .join("");
    download(
      "Audi-Hampton-Vehicle-Locations.kml",
      `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${marks}</Document></kml>`,
      "application/vnd.google-earth.kml+xml",
    );
  }
  if (!ready)
    return (
      <div className="loading">
        {notice?.bad ? (
          <div className="connection-error">
            <AlertTriangle />
            <h2>Could not connect to inventory</h2>
            <p>{notice.text}</p>
            <button onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : (
          "Connecting to shared inventory…"
        )}
      </div>
    );
  if (!session)
    return (
      <div className="select-page">
        <header>
          <img src={logo} />
          <div>
            <b>INVENTORY ADMINISTRATOR</b>
            <span>DESKTOP CONTROL CENTRE</span>
          </div>
          <button className="select-lock" onClick={onLock}>
            <LockKeyhole /> Lock
          </button>
        </header>
        <main>
          <div className="select-title">
            <div>
              <h1>Select an audit</h1>
              <p>Open a shared physical inventory or create a new one.</p>
            </div>
            <label className="upload">
              <Upload />
              New audit from XLSX/CSV
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) =>
                  e.target.files[0] && importAudit(e.target.files[0])
                }
              />
            </label>
          </div>
          <div className="session-grid">
            {sessions.map((s) => (
              <button key={s.id} onClick={() => openSession(s)}>
                <div>
                  <b>{s.name}</b>
                  <span>{s.source_file}</span>
                  <small>{new Date(s.created_at).toLocaleString()}</small>
                </div>
                <ChevronRight />
              </button>
            ))}
          </div>
          {!sessions.length && (
            <div className="empty">No shared audits found.</div>
          )}
        </main>
        <Footer />
      </div>
    );
  return (
    <div className="shell">
      <aside>
        <div className="side-brand">
          <img src={logo} />
          <span>ADMINISTRATOR</span>
        </div>
        <nav>
          {[
            ["dashboard", LayoutDashboard, "Dashboard"],
            ["map", MapPinned, "Map viewer"],
            ["inventory", Car, "Inventory"],
            ["exceptions", AlertTriangle, "Exceptions"],
            ["reports", FileDown, "Reports"],
          ].map(([id, I, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <I />
              {label}
            </button>
          ))}
        </nav>
        <button
          className="switch"
          onClick={() => {
            setSession(null);
            setVehicles([]);
            setScans({});
          }}
        >
          <LogOut />
          Switch audit
        </button>
      </aside>
      <div className="workspace">
        <header className="top">
          <div>
            <b>{session.name}</b>
            <span>{session.source_file}</span>
          </div>
          <div className="top-actions">
            <button onClick={() => loadData(session.id)} disabled={busy}>
              <RefreshCw /> Refresh
            </button>
            <button onClick={onLock}>
              <LockKeyhole /> Lock
            </button>
          </div>
        </header>
        <main>
          {tab === "dashboard" && (
            <>
              <PageTitle
                title="Dashboard"
                text="Live physical inventory status across all connected devices."
              />
              <div className="cards">
                <Card n={total} label="Vehicles on list" />
                <Card n={found} label="Confirmed" good />
                <Card n={total - found} label="Not confirmed" warn />
                <Card n={scannerCount} label="Team members" />
              </div>
              <div className="panel">
                <h2>Progress</h2>
                <div className="big-progress">
                  <div>
                    <span
                      style={{ width: `${total ? (found / total) * 100 : 0}%` }}
                    />
                  </div>
                  <b>
                    {total ? Math.round((found / total) * 100) : 0}% complete
                  </b>
                </div>
                <h2>Recent confirmations</h2>
                <VehicleRows
                  rows={Object.values(scans)
                    .sort(
                      (a, b) => new Date(b.scanned_at) - new Date(a.scanned_at),
                    )
                    .slice(0, 10)
                    .map((s) => byVin.get(s.vin))
                    .filter(Boolean)}
                  scans={scans}
                  vinKey={vinKey}
                  stockKey={stockKey}
                  onRemove={removeScan}
                />
              </div>
            </>
          )}
          {tab === "map" && (
            <>
              <PageTitle
                title="Map viewer"
                text="Search by stock number, VIN or model, then select a result to zoom to its pin."
              />
              <div className="map-layout">
                <div className="map-side">
                  <SearchBox
                    query={query}
                    setQuery={setQuery}
                    placeholder="Find stock, VIN or model…"
                  />
                  <div className="map-results">
                    <b>{located.length} mapped vehicles</b>
                    {located.map((r) => {
                      const v = norm(r[vinKey] || r.VIN),
                        s = scans[v];
                      return (
                        <button
                          className={selected === v ? "selected" : ""}
                          key={v}
                          onClick={() => setSelected(v)}
                        >
                          <MapPin />
                          <div>
                            <strong>{r[stockKey] || v}</strong>
                            <span>{r["Yr/Mk/Mdl"] || ""}</span>
                            <small>{v}</small>
                            <small>
                              {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                            </small>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <AdminMap
                  rows={rows}
                  scans={scans}
                  vinKey={vinKey}
                  stockKey={stockKey}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
            </>
          )}
          {tab === "inventory" && (
            <>
              <PageTitle
                title="Inventory management"
                text="Search, filter and remove incorrect confirmations."
              />
              <div className="toolbar">
                <SearchBox
                  query={query}
                  setQuery={setQuery}
                  placeholder="Search inventory…"
                />
                <Filter value={filter} set={setFilter} />
              </div>
              <div className="panel table-panel">
                <InventoryTable
                  rows={searched}
                  scans={scans}
                  vinKey={vinKey}
                  stockKey={stockKey}
                  onRemove={removeScan}
                />
              </div>
            </>
          )}
          {tab === "exceptions" && (
            <>
              <PageTitle
                title="Exceptions"
                text="VINs scanned by the field team that were not found on the loaded inventory."
              />
              <div className="panel">
                <table>
                  <thead>
                    <tr>
                      <th>VIN</th>
                      <th>Employee</th>
                      <th>Time</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((e) => (
                      <tr key={e.id || e.scanned_at}>
                        <td>
                          <b>{e.vin}</b>
                        </td>
                        <td>{e.employee_name}</td>
                        <td>{new Date(e.scanned_at).toLocaleString()}</td>
                        <td>
                          {e.latitude != null
                            ? `${e.latitude.toFixed(6)}, ${e.longitude.toFixed(6)}`
                            : "No GPS"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!exceptions.length && (
                  <div className="empty">No exceptions recorded.</div>
                )}
              </div>
            </>
          )}
          {tab === "reports" && (
            <>
              <PageTitle
                title="Reports and exports"
                text="Download current reconciliation data or vehicle locations."
              />
              <div className="cards">
                <Card n={total} label="Total" />
                <Card n={found} label="Confirmed" good />
                <Card n={total - found} label="Not confirmed" warn />
              </div>
              <div className="panel export-grid">
                <button onClick={() => exportCSV("all")}>
                  <FileDown />
                  <b>Complete reconciliation</b>
                  <span>All vehicles and confirmation details</span>
                </button>
                <button onClick={() => exportCSV("confirmed")}>
                  <CheckCircle2 />
                  <b>Confirmed vehicles</b>
                  <span>Located vehicles only</span>
                </button>
                <button onClick={() => exportCSV("missing")}>
                  <AlertTriangle />
                  <b>Unconfirmed vehicles</b>
                  <span>Outstanding vehicles only</span>
                </button>
                <button onClick={exportKML}>
                  <MapPinned />
                  <b>Google Earth KML</b>
                  <span>Every confirmed vehicle with GPS</span>
                </button>
              </div>
            </>
          )}
        </main>
        <Footer />
      </div>
      {notice && (
        <div
          className={notice.bad ? "toast bad" : "toast"}
          onClick={() => setNotice(null)}
        >
          {notice.bad ? <AlertTriangle /> : <CheckCircle2 />}
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  );
}
function PageTitle({ title, text }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Card({ n, label, good, warn }) {
  return (
    <div className={"card " + (good ? "good " : warn ? "warn " : "")}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}
function SearchBox({ query, setQuery, placeholder }) {
  return (
    <label className="search">
      <Search />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Filter({ value, set }) {
  return (
    <div className="filters">
      {[
        ["all", "All"],
        ["confirmed", "Confirmed"],
        ["missing", "Not confirmed"],
      ].map(([v, l]) => (
        <button
          className={value === v ? "active" : ""}
          key={v}
          onClick={() => set(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
function VehicleRows({ rows, scans, vinKey, stockKey, onRemove }) {
  return (
    <div className="vehicle-rows">
      {rows.map((r) => {
        const v = norm(r[vinKey] || r.VIN),
          s = scans[v];
        return (
          <div key={v}>
            <span className="status yes">Confirmed</span>
            <div>
              <b>{r[stockKey] || v}</b>
              <span>{r["Yr/Mk/Mdl"] || ""}</span>
            </div>
            <small>
              {s?.employee_name}
              <br />
              {s && new Date(s.scanned_at).toLocaleString()}
            </small>
            <button onClick={() => onRemove(v)}>
              <Trash2 />
            </button>
          </div>
        );
      })}
    </div>
  );
}
function InventoryTable({ rows, scans, vinKey, stockKey, onRemove }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Stock</th>
          <th>Vehicle</th>
          <th>VIN</th>
          <th>Confirmed by</th>
          <th>GPS</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const v = norm(r[vinKey] || r.VIN),
            s = scans[v];
          return (
            <tr key={v}>
              <td>
                <span className={"status " + (s ? "yes" : "no")}>
                  {s ? "Confirmed" : "Not confirmed"}
                </span>
              </td>
              <td>
                <b>{r[stockKey] || "—"}</b>
              </td>
              <td>{r["Yr/Mk/Mdl"] || ""}</td>
              <td>
                <code>{v}</code>
              </td>
              <td>
                {s ? (
                  <>
                    {s.employee_name}
                    <small>{new Date(s.scanned_at).toLocaleString()}</small>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {s?.latitude != null ? (
                  <>
                    <MapPin />
                    Yes
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {s && (
                  <button
                    className="delete"
                    title="Remove scan"
                    onClick={() => onRemove(v)}
                  >
                    <Trash2 />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
function Footer() {
  return (
    <footer>Powered by Blood, Sweat, and Tears and built by J. Langer</footer>
  );
}
createRoot(document.getElementById("root")).render(<AdminGate />);
