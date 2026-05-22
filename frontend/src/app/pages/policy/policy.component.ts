import { Component, computed } from '@angular/core';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { PageBaseComponent } from '../page-base.component';

@Component({
    selector: 'app-policy',
    imports: [MarkdownPipe],
    templateUrl: './policy.component.html',
    styleUrl: './policy.component.css'
})
export class PolicyComponent extends PageBaseComponent<string> {
    readonly displayContent = computed(() => this.pageContent() ?? '');
}
