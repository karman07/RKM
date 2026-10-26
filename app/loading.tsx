export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]" aria-busy="true">
      <div className="h-10 w-10 rounded-full border-2 border-[#EDEAE4] border-t-[#B8975A] animate-spin" />
    </div>
  );
}
