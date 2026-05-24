import Button from "@components/ui/Button";
import { toast, ToastContainer } from "@components/ui/Toast";

export function ButtonVariants() {
    return (
        <>
            <Button variant="filled" onclick={() => toast.info("Filled")}>Filled (Default)</Button>
            <Button variant="outlined" onclick={() => toast.info("Outlined")}>Outlined</Button>
            <Button variant="ghost" onclick={() => toast.info("Ghost")}>Ghost</Button>
            <ToastContainer />
        </>
    );
}


export function ButtonSizes() {
    return (
        <>
            <Button size="sm" onclick={() => toast.info("Small")}>small (sm)</Button>
            <Button size="md" onclick={() => toast.info("Medium")}>Medium (md, default)</Button>
            <Button size="lg" onclick={() => toast.info("Large")}>Large (lg)</Button>
            <ToastContainer />
        </>
    );
}
