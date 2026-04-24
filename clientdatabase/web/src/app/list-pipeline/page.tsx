"use client";

import AppSidebar from "@/components/AppSidebar";
import ListPipelinePanel from "@/components/list-pipeline-panel";

export default function ListPipelinePage() {
  return (
    <div className="app-layout">
      <AppSidebar active="lists" />
      <div className="content-area" style={{ overflowY: "auto", padding: 24, maxWidth: 920 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>List pipeline</h1>
        <ListPipelinePanel variant="standalone" />
      </div>
    </div>
  );
}
