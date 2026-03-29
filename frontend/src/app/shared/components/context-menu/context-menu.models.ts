export interface ContextMenuOption {
    label: string;
    action?: () => void;
    icon?: string;
    disabled?: boolean;
    separator?: boolean;
}
