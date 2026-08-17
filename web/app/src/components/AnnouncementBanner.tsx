import { useState } from "react";
import { Alert, AlertDescription, cn } from "@e-infra/design-system";
import { X } from "lucide-react";

interface AnnouncementProps {
  message: string;
  variant?: "default" | "success" | "warning" | "error";
}

export function Announcement({
  message,
  variant = "warning",
}: AnnouncementProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 pt-4 max-w-7xl">
      <Alert variant={variant}>
        <AlertDescription className="flex w-full items-start justify-between gap-4">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss announcement"
            className={cn(
              "shrink-0 rounded-sm p-1 opacity-70 transition-opacity",
              "hover:opacity-100 focus:opacity-100",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
