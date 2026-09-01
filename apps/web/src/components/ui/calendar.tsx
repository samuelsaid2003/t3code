"use client";

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "~/lib/utils";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      className={cn("p-2 [--cell-size:--spacing(8)]", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: "relative flex flex-col gap-4",
        month: "flex w-full flex-col gap-3",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(buttonVariants({ size: "icon-xs", variant: "ghost" }), "relative z-10"),
        button_next: cn(buttonVariants({ size: "icon-xs", variant: "ghost" }), "relative z-10"),
        month_caption: "flex h-7 items-center justify-center px-8",
        caption_label: "select-none text-xs font-medium",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "flex-1 select-none rounded-md text-center text-[10px] font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative size-(--cell-size) p-0 text-center text-xs",
        day_button: cn(
          buttonVariants({ size: "icon-sm", variant: "ghost" }),
          "size-(--cell-size) rounded-md p-0 font-normal data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        ),
        today: "rounded-md bg-accent text-accent-foreground",
        outside: "text-muted-foreground opacity-45",
        disabled: "text-muted-foreground opacity-35",
        hidden: "invisible",
        selected: "rounded-md bg-primary text-primary-foreground",
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation, ...chevronProps }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeftIcon
              : orientation === "right"
                ? ChevronRightIcon
                : ChevronDownIcon;
          return <Icon className={cn("size-3.5", chevronClassName)} {...chevronProps} />;
        },
      }}
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

export { Calendar };
