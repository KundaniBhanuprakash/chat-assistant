import { Check, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODE_OPTIONS, modeLabel, type ChatMode } from "@/lib/models";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

const ModelSelector = ({ value, onChange, disabled }: ModelSelectorProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={`Assistant mode: ${modeLabel(value)}. Change mode`}
        className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[9rem] truncate">{modeLabel(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64">
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Choose how the assistant thinks
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {MODE_OPTIONS.map((option) => (
        <DropdownMenuItem
          key={option.id}
          onSelect={() => onChange(option.id)}
          className="flex items-start gap-2 py-2"
        >
          <Check
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              option.id === value ? "opacity-100 text-primary" : "opacity-0"
            )}
            aria-hidden="true"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.description}</span>
          </span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ModelSelector;
