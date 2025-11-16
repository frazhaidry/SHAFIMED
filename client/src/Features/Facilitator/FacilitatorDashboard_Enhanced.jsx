import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../lib/api";
import FacilitatorLayout from "../../components/layout/FacilitatorLayout";
import Button from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import TableShimmer from "../../components/ui/DoctorSelectShimmer";

// ✅ Possible case statuses
const STATUSES = ["Pending", "Assigned", "In Progress", "Follow Up", "Closed"];

export default function FacilitatorDashboard() {
  const [cases, setCases] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [updatingCaseId, setUpdatingCaseId] = useState(null); // disable UI while updating
  

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // -------- FETCH DATA --------
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        const [casesRes, doctorsRes] = await Promise.all([
          api.get("/queries"),
          api.get("/users/doctors"),
        ]);

        // Ensure safe array handling
        setCases(Array.isArray(casesRes.data) ? casesRes.data : []);
        setDoctors(Array.isArray(doctorsRes.data) ? doctorsRes.data : []);
      } catch (error) {
        console.error("Error fetching data:", error);
        setCases([]);
        setDoctors([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // -------- SYNC STATUS TAB WITH URL PARAM --------
  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (!statusParam) return setTab("All");

    const matched = STATUSES.find(
      (s) => s.toLowerCase() === statusParam.toLowerCase()
    );
    setTab(matched || "All");
  }, [searchParams]);

  // -------- RECENT CASES (LATEST 6) --------
  const recentCases = useMemo(() => {
    return [...cases]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);
  }, [cases]);

  // -------- BASIC FILTER (For future search/filter feature) --------
  // const filteredCases = useMemo(() => {
  //   return cases
  //     .filter((c) => (tab === "All" ? true : c.status === tab))
  //     .filter((c) =>
  //       q ? (c.title || "").toLowerCase().includes(q.toLowerCase()) : true
  //     );
  // }, [cases, tab, q]);

  // -------- COMPUTE CASE STATISTICS --------
  const stats = useMemo(() => {
    const count = {
      total: 0,
      pending: 0,
      assigned: 0,
      inprogress: 0,
      followup: 0,
      closed: 0,
      rejected: 0,
      unknown: 0,
    };

    cases.forEach((c) => {
      count.total++;
      const key = (c.status || "unknown").toLowerCase().replace(/\s+/g, "");
      if (count[key] !== undefined) count[key]++;
      else count.unknown++;
    });

    return count;
  }, [cases]);

  // -------- HELPER: Extract updated case safely from response --------  
  const extractUpdatedCase = (data) => {
    if (!data) return null;

    // Direct object
    if (data._id || data.id) return data;

    // Nested keys
    for (const key of ["case", "data", "result", "payload"]) {
      if (data[key] && (data[key]._id || data[key].id)) return data[key];
    }

    // Deep nested fallback
    const nested = Object.values(data).find((v) => v && typeof v === "object" && (v._id || v.id));
    return nested || null;
  };

  // -------- UPDATE CASE STATUS --------
  const handleUpdateStatus = useCallback(
    async (caseId, newStatus) => {
      if (!caseId) return;

      setUpdatingCaseId(caseId);

      // Optimistic UI update
      setCases((prev) =>
        prev.map((c) => (c._id === caseId ? { ...c, status: newStatus } : c))
      );

      try {
        const res = await api.put(`/queries/${caseId}`, { status: newStatus });
        const updated = extractUpdatedCase(res.data) ?? res.data;

        if (updated && (updated._id || updated.id)) {
          const id = updated._id || updated.id;

          setCases((prev) =>
            prev.map((c) =>
              String(c._id) === String(id) ? { ...c, ...updated } : c
            )
          );

          // Update modal if open
          if (selectedCase && String(selectedCase._id) === String(id)) {
            setSelectedCase((prev) => ({ ...prev, ...updated }));
          }
        } else {
          console.warn("Unexpected update shape, kept optimistic UI:", res.data);
        }
      } catch (error) {
        console.error("Failed to update case:", error);

        // Re-fetch all if update failed
        try {
          const refetch = await api.get("/queries");
          setCases(Array.isArray(refetch.data) ? refetch.data : []);
        } catch (reErr) {
          console.error("Failed to refetch after update error:", reErr);
        }

        alert("Failed to update case status");
      } finally {
        setUpdatingCaseId(null);
      }
    },
    [selectedCase]
  );

  // -------- GET ASSIGNED DOCTOR INFO --------
  const getAssignedDoctor = useCallback(
    (assignedDoctorId) => {
      if (!assignedDoctorId) return null;

      if (typeof assignedDoctorId === "string") {
        return (
          doctors.find(
            (d) => d._id === assignedDoctorId || d.id === assignedDoctorId
          ) || { name: "Doctor", specialization: "" }
        );
      }

      return assignedDoctorId;
    },
    [doctors]
  );

  // -------- KPI CARDS CONFIG --------
  const cardConfigs = [
    { label: 'pending', value: stats.pending, color: "bg-yellow-50", icon: "⏳", statusQuery: "Pending" },
    { label: 'inProgress', value: stats.inprogress, color: "bg-teal-50", icon: "🔄", statusQuery: "In Progress" },
    { label: 'followUps', value: stats.followup, color: "bg-orange-50", icon: "📌", statusQuery: "Follow Up" },
    { label: 'assigned', value: stats.assigned, color: "bg-indigo-50", icon: "👨‍⚕️", statusQuery: "Assigned" },
    { label: 'closed', value: stats.closed, color: "bg-green-50", icon: "✅", statusQuery: "Closed" },
    // { label: 'rejected', value: stats.rejected, color: "bg-red-50", icon: "❌", statusQuery: "Rejected" },
    { label: 'totalCases', value: stats.total, color: "bg-gray-50", icon: "📋", statusQuery: "All" },
    { label: 'failedCases', value: stats.failed, color: "bg-gray-50", icon: "❌", statusQuery: "Failed Cases" },
    // { label: t('facilitator.quotes'), value: stats.unknown, color: "bg-gray-50", icon: "❓", statusQuery: "quotes" },
   
  ];

  // -------- WHEN KPI CARD IS CLICKED --------
  const onCardClick = (status) => {
    status === "All" ? setSearchParams({}) : setSearchParams({ status });
  };

  // -------- CASE DETAILS MODAL --------
  const CaseDetailsModal = ({ item, onClose }) => {
    if (!item) return null;
    const assigned = getAssignedDoctor(item.assignedDoctorId);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Background Overlay */}
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        {/* Modal Content */}
        <div className="relative bg-white rounded-lg max-w-2xl w-full shadow-lg overflow-auto max-h-[90vh]">
          <div className="p-6">
            {/* Header */}
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-semibold">Case Details</h3>
              <button className="text-gray-500" onClick={onClose}>
                ✕
              </button>
            </div>

            {/* Case Info */}
            <div className="space-y-4">
              <Info label="Patient" value={item.fullName} />
              <Info label="Reference ID" value={item.referenceId} mono />
              <Info label="Title" value={item.title} />
              <Info label="Description" value={item.description || "No description"} />

              <div className="grid grid-cols-2 gap-4">
                <Info label="Country" value={item.country} />
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <select
                    value={item.status}
                    onChange={(e) => {
                      handleUpdateStatus(item._id, e.target.value);
                      setSelectedCase((prev) => ({ ...prev, status: e.target.value }));
                    }}
                    disabled={updatingCaseId === item._id}
                    className="mt-1 px-2 py-1 border rounded"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {assigned && (
                <div>
                  <p className="text-sm text-gray-500">Assigned Doctor</p>
                  <p className="font-medium">{assigned.name}</p>
                  {assigned.specialization && (
                    <p className="text-xs text-gray-500">{assigned.specialization}</p>
                  )}
                </div>
              )}

              {item.attachments?.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500">Attachments</p>
                  <div className="mt-2 space-y-2">
                    {item.attachments.map((a, i) => (
                      <div key={i} className="flex gap-2 p-2 bg-gray-50 rounded items-center">
                        📎 <span className="text-sm">{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                onClick={() =>
                  navigate(
                    `/facilitator/case-by-ref?ref=${encodeURIComponent(
                      item.referenceId || ""
                    )}`
                  )
                }
                disabled={!item.referenceId}
              >
                Open Page
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Small reusable info block
  const Info = ({ label, value, mono = false }) => (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`${mono ? "font-mono" : "font-medium"} text-base`}>
        {value || "—"}
      </p>
    </div>
  );

  // -------- MAIN RETURN --------
  return (
    <FacilitatorLayout
      title="Dashboard"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setSearchParams({}); setQ(""); }}>
            Reset
          </Button>
          <Button onClick={() => navigate("/facilitator/pending")}>⏳ View Pending</Button>
        </div>
      }
    >
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cardConfigs.map((card) => (
          <Card
            key={card.label}
            onClick={() => onCardClick(card.label)}
            className={`${card.color} p-5 rounded-lg shadow-sm hover:shadow-md transition-transform hover:-translate-y-0.5 cursor-pointer`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className="text-2xl font-semibold">{card.value ?? 0}</p>
              </div>
              <div className="w-12 h-12 bg-white/60 rounded-full flex items-center justify-center text-lg">
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* RECENT CASES TABLE */}
<div>
  <div className="flex justify-between mb-4">
    <h2 className="text-xl font-semibold">Recent Cases (Latest 6)</h2>
    <Button variant="outline" onClick={() => navigate("/facilitator/cases")}>
      View All Cases →
    </Button>
  </div>

  <Card className="overflow-hidden border shadow-lg">
    {loading ? (
      <TableShimmer rows={6} cols={8} />
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {[
                "Patient",
                "Reference",
                "Title",
                "Country",
                "Assigned Doctor",
                "Status",
                "Created",
                "Actions",
              ].map((head) => (
                <th key={head} className="px-5 py-3 text-left font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {recentCases.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-5 py-10 text-center text-gray-500">
                  No recent cases found.
                </td>
              </tr>
            ) : (
              recentCases.map((c) => {
                const assigned = getAssignedDoctor(c.assignedDoctorId);
                return (
                  <tr key={c._id} className="border-t hover:bg-gray-50">
                    <td className="px-5 py-3">{c.fullName || "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs font-semibold">
                      {c.referenceId || "—"}
                    </td>
                    <td className="px-5 py-3 truncate max-w-xs">{c.title}</td>
                    <td className="px-5 py-3">{c.country}</td>

                    {/* Assigned Doctor */}
                    <td className="px-5 py-3">
                      {assigned ? (
                        <>
                          <div className="font-medium">{assigned.name}</div>
                          {assigned.specialization && (
                            <div className="text-xs text-gray-500">
                              {assigned.specialization}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">Not assigned</span>
                      )}
                    </td>

                    {/* Status Dropdown */}
                    <td className="px-5 py-3">
                      <select
                        value={c.status || "Pending"}
                        onChange={(e) => handleUpdateStatus(c._id, e.target.value)}
                        disabled={updatingCaseId === c._id}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-3 text-gray-600">
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString()
                        : "—"}
                    </td>

                    <td className="px-5 py-3">
                      <Button size="sm" onClick={() => setSelectedCase(c)}>
                        View Details
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    )}
  </Card>
</div>

      

      {/* CASE DETAILS MODAL */}
      {selectedCase && (
        <CaseDetailsModal
          item={selectedCase}
          onClose={() => setSelectedCase(null)}
        />
      )}
    </FacilitatorLayout>
  );
}