/** Map langify/Mongo generation stage to Arabic loading copy. */
export function generationStageLabel(stage: string | null | undefined): string {
  switch (stage) {
    case 'queued':
    case 'preparing_situation':
      return 'بنجهّز الموقف…';
    case 'writing_exercises':
      return 'بنكتب التمارين…';
    case 'reviewing':
    case 'validating':
      return 'بنراجع…';
    case 'done':
      return 'جاهز';
    default:
      return stage ? `…${stage}` : 'بنجهّز الدرس…';
  }
}
