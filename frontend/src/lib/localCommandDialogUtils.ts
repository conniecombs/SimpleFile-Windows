export type LocalCommandModalResult = string | boolean | null | undefined;

export function modalText(result: LocalCommandModalResult) {
  return typeof result === 'string' ? result.trim() : '';
}
