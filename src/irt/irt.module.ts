import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IrtService } from './irt.service';
import { IrtController } from './irt.controller';

@Module({
    imports: [ConfigModule],
    providers: [IrtService],
    controllers: [IrtController],
    exports: [IrtService],
})
export class IrtModule { }
