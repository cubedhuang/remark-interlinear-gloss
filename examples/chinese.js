import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkInterlinearGloss from "remark-interlinear-gloss";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { read } from "to-vfile";
import { unified } from "unified";

const file = await unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkInterlinearGloss)
  .use(remarkRehype)
  .use(rehypeStringify)
  .process(await read("chinese.md"));

console.log(String(file));
