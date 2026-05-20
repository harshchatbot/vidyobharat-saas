'use client';

import * as React from 'react';
import { createContext, useContext, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

type StepState = 'active' | 'completed' | 'inactive' | 'loading';
type Orientation = 'horizontal' | 'vertical';

interface StepperContextValue {
  activeStep: number;
  setActiveStep: (step: number) => void;
  stepsCount: number;
  orientation: Orientation;
  registerTrigger: (step: number, node: HTMLButtonElement | null) => void;
  triggerNodes: Map<number, HTMLButtonElement>;
  focusNext: () => void;
  focusPrev: () => void;
  focusFirst: () => void;
  focusLast: () => void;
  indicators: Map<number, string>;
  setIndicators: (indicators: Map<number, string>) => void;
}

const StepperContext = createContext<StepperContextValue | undefined>(undefined);

export function useStepper() {
  const context = useContext(StepperContext);
  if (!context) {
    throw new Error('useStepper must be used within Stepper component');
  }
  return context;
}

interface StepItemContextValue {
  step: number;
  state: StepState;
}

const StepItemContext = createContext<StepItemContextValue | undefined>(undefined);

export function useStepItem() {
  const context = useContext(StepItemContext);
  if (!context) {
    throw new Error('useStepItem must be used within StepperItem component');
  }
  return context;
}

interface StepperProps {
  value: number;
  onValueChange?: (value: number) => void;
  orientation?: Orientation;
  children: React.ReactNode;
  className?: string;
}

export function Stepper({
  value,
  onValueChange,
  orientation = 'horizontal',
  children,
  className,
}: StepperProps) {
  const [activeStep, setActiveStep] = React.useState(value);
  const [stepsCount, setStepsCount] = React.useState(0);
  const triggerNodesRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [indicators, setIndicators] = React.useState<Map<number, string>>(new Map());

  React.useEffect(() => {
    setActiveStep(value);
  }, [value]);

  const handleSetActiveStep = (step: number) => {
    setActiveStep(step);
    onValueChange?.(step);
  };

  const focusNode = (step: number) => {
    const node = triggerNodesRef.current.get(step);
    if (node) {
      node.focus();
    }
  };

  const focusNext = () => {
    const nextStep = activeStep + 1;
    if (nextStep <= stepsCount) {
      focusNode(nextStep);
    }
  };

  const focusPrev = () => {
    const prevStep = activeStep - 1;
    if (prevStep >= 1) {
      focusNode(prevStep);
    }
  };

  const focusFirst = () => {
    focusNode(1);
  };

  const focusLast = () => {
    focusNode(stepsCount);
  };

  const value_: StepperContextValue = {
    activeStep,
    setActiveStep: handleSetActiveStep,
    stepsCount,
    orientation,
    registerTrigger: (step, node) => {
      if (node) {
        triggerNodesRef.current.set(step, node);
      } else {
        triggerNodesRef.current.delete(step);
      }
    },
    triggerNodes: triggerNodesRef.current,
    focusNext,
    focusPrev,
    focusFirst,
    focusLast,
    indicators,
    setIndicators,
  };

  return (
    <StepperContext.Provider value={value_}>
      <div
        className={cn(
          'flex',
          orientation === 'horizontal' ? 'flex-row' : 'flex-col',
          className
        )}
        data-slot="stepper"
        data-orientation={orientation}
      >
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child) && child.type === StepperNav) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onStepsCountChange: setStepsCount,
            });
          }
          return child;
        })}
      </div>
    </StepperContext.Provider>
  );
}

interface StepperItemProps {
  step: number;
  completed?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function StepperItem({
  step,
  completed = false,
  loading = false,
  children,
  className,
}: StepperItemProps) {
  const stepper = useStepper();

  const state: StepState =
    completed ? 'completed' : loading ? 'loading' : step === stepper.activeStep ? 'active' : 'inactive';

  const value_: StepItemContextValue = { step, state };

  return (
    <StepItemContext.Provider value={value_}>
      <div
        className={cn('flex items-center', className)}
        data-slot="stepper-item"
        data-step={step}
        data-state={state}
      >
        {children}
      </div>
    </StepItemContext.Provider>
  );
}

interface StepperTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  children?: React.ReactNode;
}

export function StepperTrigger({
  asChild = false,
  children,
  onClick,
  onKeyDown,
  ...props
}: StepperTriggerProps) {
  const stepper = useStepper();
  const stepItem = useStepItem();

  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stepper.registerTrigger(stepItem.step, ref.current);
    return () => stepper.registerTrigger(stepItem.step, null);
  }, [stepper, stepItem.step]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    stepper.setActiveStep(stepItem.step);
    onClick?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepper.focusNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepper.focusPrev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      stepper.focusFirst();
    } else if (e.key === 'End') {
      e.preventDefault();
      stepper.focusLast();
    }
    onKeyDown?.(e);
  };

  if (asChild) {
    return React.cloneElement(
      children as React.ReactElement,
      { onClick: handleClick, onKeyDown: handleKeyDown } as any,
    );
  }

  return (
    <button
      ref={ref}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-slot="stepper-trigger"
      {...props}
    >
      {children}
    </button>
  );
}

interface StepperIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function StepperIndicator({ children, className, ...props }: StepperIndicatorProps) {
  const { state } = useStepItem();

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      data-slot="stepper-indicator"
      data-state={state}
      {...props}
    >
      {children}
    </div>
  );
}

interface StepperSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export function StepperSeparator({ className, ...props }: StepperSeparatorProps) {
  const stepper = useStepper();

  return (
    <div
      className={cn(
        stepper.orientation === 'horizontal' ? 'flex-1 h-0.5' : 'w-0.5 flex-1',
        className
      )}
      data-slot="stepper-separator"
      {...props}
    />
  );
}

interface StepperTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children?: React.ReactNode;
}

export function StepperTitle({ children, className, ...props }: StepperTitleProps) {
  return (
    <h3
      className={cn('text-sm font-semibold', className)}
      data-slot="stepper-title"
      {...props}
    >
      {children}
    </h3>
  );
}

interface StepperDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
}

export function StepperDescription({ children, className, ...props }: StepperDescriptionProps) {
  return (
    <p
      className={cn('text-xs text-muted', className)}
      data-slot="stepper-description"
      {...props}
    >
      {children}
    </p>
  );
}

interface StepperNavProps extends React.HTMLAttributes<HTMLDivElement> {
  onStepsCountChange?: (count: number) => void;
  children?: React.ReactNode;
}

export function StepperNav({ onStepsCountChange, children, className, ...props }: StepperNavProps) {
  const childrenArray = React.Children.toArray(children);
  const stepsCount = childrenArray.filter((child) => React.isValidElement(child) && child.type === StepperItem).length;

  useEffect(() => {
    onStepsCountChange?.(stepsCount);
  }, [stepsCount, onStepsCountChange]);

  return (
    <div
      className={cn('flex items-center', className)}
      data-slot="stepper-nav"
      {...props}
    >
      {children}
    </div>
  );
}

interface StepperPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  step: number;
  children?: React.ReactNode;
}

export function StepperPanel({ step, children, className, ...props }: StepperPanelProps) {
  const stepper = useStepper();

  if (step !== stepper.activeStep) {
    return null;
  }

  return (
    <div
      className={cn('w-full', className)}
      data-slot="stepper-panel"
      data-step={step}
      {...props}
    >
      {children}
    </div>
  );
}

interface StepperContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function StepperContent({ children, className, ...props }: StepperContentProps) {
  return (
    <div
      className={cn('flex-1', className)}
      data-slot="stepper-content"
      {...props}
    >
      {children}
    </div>
  );
}
