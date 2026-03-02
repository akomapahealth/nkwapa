"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Box } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { dataGridSx } from "@/lib/datagrid-theme";

interface ClinicRow {
  id: string;
  name: string;
  region: string | null;
  isActive: boolean;
}

export default function AdminClinicsPage() {
  const getToken = useAuth();
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formRegion, setFormRegion] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchClinics = useCallback(async () => {
    if (!getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/clinics", {
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ClinicRow[];
      setClinics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClinics([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchClinics();
  }, [fetchClinics]);

  const handleCreate = async () => {
    if (!getToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/clinics", {
        method: "POST",
        body: JSON.stringify({
          name: formName.trim(),
          region: formRegion.trim() || undefined,
        }),
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) throw new Error(await res.text());
      setCreateOpen(false);
      setFormName("");
      setFormRegion("");
      await fetchClinics();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (clinic: ClinicRow) => {
    setEditingClinic(clinic);
    setFormName(clinic.name);
    setFormRegion(clinic.region ?? "");
    setFormIsActive(clinic.isActive);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!getToken || !editingClinic) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/admin/clinics/${encodeURIComponent(editingClinic.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: formName.trim(),
            region: formRegion.trim() || undefined,
            isActive: formIsActive,
          }),
          getToken,
          skipClinicHeader: true,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      setEditOpen(false);
      setEditingClinic(null);
      await fetchClinics();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: GridColDef[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 180 },
    { field: "region", headerName: "Region", width: 120 },
    {
      field: "isActive",
      headerName: "Active",
      width: 80,
      type: "boolean",
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditOpen(params.row as ClinicRow)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <RouteGuard requiredPermission="CLINIC.MANAGE">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-heading">Clinics</h1>
          <Button onClick={() => setCreateOpen(true)}>Create clinic</Button>
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
          <DataGrid
            rows={clinics}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.id}
            sx={dataGridSx}
          />
        </Box>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create clinic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Clinic name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-region">Region (optional)</Label>
              <Input
                id="create-region"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="Region"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !formName.trim()}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit clinic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Clinic name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-region">Region (optional)</Label>
              <Input
                id="edit-region"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="Region"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-active"
                checked={formIsActive}
                onCheckedChange={(v) => setFormIsActive(v === true)}
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={saving || !formName.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RouteGuard>
  );
}
