import ProcreateDetailPage from "@/components/gallery/procreate-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const procreateId = Number.parseInt(id, 10);

  return <ProcreateDetailPage procreateId={procreateId} />;
}
