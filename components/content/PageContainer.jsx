export default function PageContainer({
  children,
  className = '',
  noPadding = false,
}) {
  if (noPadding) {
    return (
      <div className={`w-full max-w-[1600px] mx-auto ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 py-6 sm:py-8 ${className}`}>
      {children}
    </div>
  );
}
