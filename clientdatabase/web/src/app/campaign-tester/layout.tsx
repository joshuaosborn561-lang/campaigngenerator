import CampaignTesterStepGuide from "@/components/CampaignTesterStepGuide";

export default function CampaignTesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ctf-layout">
      <CampaignTesterStepGuide />
      <div className="ctf-layout-main">{children}</div>
    </div>
  );
}
