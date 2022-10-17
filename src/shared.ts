export function assertDefined<T>(w: T | undefined | null): asserts w is T {
    if(w === null || w === undefined) {
        throw new Error("Should have been defined ?")
    }
}