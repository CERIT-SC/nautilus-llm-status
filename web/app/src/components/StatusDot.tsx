interface StatusDotProps {
  status: "online" | "down" | "archived";
}

export function StatusDot({ status }: StatusDotProps) {
  const colors = {
    online: "bg-success",
    down: "bg-error",
    archived: "bg-gray-400",
  };

  const animations = {
    online: "animate-ping",
    down: "",
    archived: "",
  };

  return (
    <span className="relative flex size-2.5">
      <span
        className={`relative inline-flex size-2.5 rounded-full ${colors[status]}`}
        title={status}
      />
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${colors[status]} ${animations[status]}`}
      ></span>
    </span>
  );
}
